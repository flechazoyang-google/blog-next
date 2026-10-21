# 博客运维手册

> 最后更新：2026-10-21
> 站点：https://blog.yghsite.cn
> 代码仓库：本地 `blog-next`

---

## 一、架构

```
浏览器
  ↓ HTTPS (443)
Nginx（原证书沿用）
  ├─ /images/*  → /var/www/blog-images/（静态直出，不经 Node）
  └─ /*         → 127.0.0.1:8090
                    ↓
              blog.service（systemd）
                    ↓
              /var/lib/blog/blog.db（SQLite）
```

| 组件 | 说明 |
|---|---|
| 应用 | Next.js 16 SSR，standalone 产物 |
| 代码位置 | `/opt/blog/` |
| 数据库 | `/var/lib/blog/blog.db` |
| 图片 | `/var/www/blog-images/` |
| 服务名 | `blog.service` |
| 端口 | `127.0.0.1:8090` |
| 内存限制 | MemoryHigh 300M / MemoryMax 400M |

---

## 二、日常命令

```bash
# 状态
systemctl status blog

# 重启（改代码后）
systemctl restart blog

# 日志
journalctl -u blog -f              # 实时
journalctl -u blog -n 100 --no-pager
journalctl -u blog --since today

# 内存
systemctl show blog -p MemoryCurrent | awk -F= '{printf "%d MB\n", $2/1048576}'

# nginx 改动后
nginx -t && systemctl reload nginx
```

---

## 三、备份

### 3.1 自动备份

| 项 | 值 |
|---|---|
| 脚本 | `/usr/local/bin/blog-backup` |
| 定时 | `/etc/cron.d/blog-backup`，每日 **04:00** |
| 本地 | `/root/blog-backups/`，保留 14 份 |
| 异地 | 坚果云 `jianguoyun:blog_backup/`，保留 14 份 |
| 日志 | `/var/log/blog-backup.log` |

**不停机备份**：用 `sqlite3 .backup` 做在线一致性快照，WAL 模式下也安全，不影响线上访问。

**每一步都有校验**：
1. `PRAGMA integrity_check` 必须返回 `ok`
2. 已发布文章数必须 ≥ 1（防止备份到空库）
3. 打包内含 `MANIFEST.txt` 记录时间、文章数、图片数

### 3.2 手动备份

```bash
/usr/local/bin/blog-backup
ls -lh /root/blog-backups/
```

### 3.3 恢复步骤

```bash
cd /tmp && rm -rf restore && mkdir restore && cd restore

# 1. 下载最新备份
LATEST=$(rclone lsf jianguoyun:blog_backup/ --files-only | sort -r | head -1)
rclone copy "jianguoyun:blog_backup/$LATEST" . --no-traverse
tar xzf "$LATEST"

# 2. 检查
cat MANIFEST.txt
sqlite3 blog.db "PRAGMA integrity_check;"

# 3. 停服务并替换
systemctl stop blog
cp /var/lib/blog/blog.db /var/lib/blog/blog.db.bak-$(date +%s)
cp blog.db /var/lib/blog/blog.db
rm -f /var/lib/blog/blog.db-wal /var/lib/blog/blog.db-shm
cp -a images/. /var/www/blog-images/
chown -R www-data:www-data /var/www/blog-images

# 4. 启动并验证
systemctl start blog
curl -sk -o /dev/null -w '%{http_code}\n' https://blog.yghsite.cn/
```

> **恢复演练已完成**（2026-10-21）：从坚果云下载最新备份，解包、校验 integrity=ok、
> 业务数据与线上完全一致（23 文章 / 4 页面 / 5 说说 / 4 评论 / 18 张图）。

### 3.4 备份脚本踩过的坑

**坚果云要求父目录必须已存在**，首次同步会报：
`AncestorsNotFound: 409 Conflict`
→ 脚本里已加 `rclone mkdir "$REMOTE"` 前置。

---

## 四、发文章

1. 浏览器打开 https://blog.yghsite.cn/admin
2. 登录（账号密码 + TOTP 两步验证）
3. 点「写文章」
4. 支持 Markdown，工具栏可插入图片（直接上传，手机上可拍照）
5. 「存草稿」或「发布」

**手机端**：顶部栏右侧有搜索和菜单按钮，后台页面已适配响应式。

---

## 五、评论管理

- 游客可直接评论，但**默认待审核**
- 后台 → 评论：可「通过 / 垃圾 / 删除」
- 防垃圾：蜜罐字段 + 同 IP 10 分钟限 3 条

---

## 六、Umami 统计

| 项 | 值 |
|---|---|
| 地址 | https://umami.yghsite.cn |
| 部署 | Docker Compose，`/opt/umami/` |
| 内存 | umami 320MB + db 180MB，实测约 344MB |
| 数据卷 | `umami-db-data` |

```bash
cd /opt/umami
docker compose ps
docker logs -f umami
docker compose restart
```

> **注意**：Umami 数据**不在博客备份里**，如需备份要单独处理。
> 统计属于可再生的分析数据，暂未纳入每日备份。

---

## 七、故障排查

| 现象 | 排查 |
|---|---|
| 站点 502 | `systemctl status blog`，看是否 OOM 被杀 |
| 图片 404 | 检查 `/var/www/blog-images/` 是否存在、属主是否 www-data |
| 内存吃紧 | `free -m`、`systemctl show blog -p MemoryCurrent` |
| 改代码不生效 | 是否忘了 `systemctl restart blog` |
| 日志太多 | `journalctl --vacuum-size=100M` |

### 重新部署流程

```bash
# 本地构建
npm run build && node scripts/package-standalone.mjs

# 上传 dist 到服务器后
systemctl stop blog
rm -rf /opt/blog/app /opt/blog/.next /opt/blog/node_modules /opt/blog/public /opt/blog/scripts /opt/blog/package.json
cp -a dist/. /opt/blog/
# ⚠️ 必须重新放 Linux 版原生模块，否则报 invalid ELF header
NEW=/root/blog-stage/build-native/node_modules/better-sqlite3/build/Release/better_sqlite3.node
for d in /opt/blog/node_modules/better-sqlite3 /opt/blog/.next/node_modules/better-sqlite3-*; do
  [ -d "$d" ] && { mkdir -p "$d/build/Release"; cp "$NEW" "$d/build/Release/better_sqlite3.node"; }
done
cd /opt/blog && npm install --no-save bcryptjs@2.4.3 gray-matter@4.0.3
systemctl start blog
```

---

## 八、回滚到 WordPress

WordPress 文件与数据库完整保留在 `/var/www/html/wordpress` 和 MySQL 的 `wpdb` 库中。

```bash
systemctl stop blog && systemctl disable blog
rm -f /etc/nginx/sites-enabled/blog
ln -sf /etc/nginx/sites-available/wordpress.conf /etc/nginx/sites-enabled/wordpress.conf
nginx -t && systemctl reload nginx
systemctl enable --now mysql
systemctl enable --now php8.4-fpm
curl -sk -o /dev/null -w '%{http_code}\n' https://blog.yghsite.cn/
```

---

## 九、待办

- [ ] **Umami 统计准确性待调整**（单篇浏览量偶有不显示）
- [ ] WordPress 目录观察 30 天后清理（可省约 500MB 磁盘）
- [ ] 考虑把 Umami 数据库纳入备份
