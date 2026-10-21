# 后台升级：上线步骤

> 对应方案：`docs/admin-backend-upgrade.md`
> 全部代码已合入本仓库，`npm run verify` 全绿（类型检查 + 44 个测试 + 构建）

---

## 一、上线前必做（不可跳过）

### 1. 备份

```bash
/usr/local/bin/blog-backup
ls -lh /root/blog-backups/ | tail -3      # 确认有新归档
```

### 2. 修历史时间戳（唯一一次改数据，务必先 dry-run）

**先说清楚这一步在修什么。** 我实测了你的库，`published_at` 里存的不是普通时间串，而是
**被截断的 `Date.toString()`**：

```
"Wed Sep 02 2026 07:"      <- 原本是 "Wed Sep 02 2026 07:30:00 GMT+0800 (CST)"
```

17 条是这个形态，另外 14 条是别的截断位置（`" ue Apr 21 2026 22:"`）。
**分钟和秒在源头就丢了，最多只能恢复到小时精度** —— 脚本不会假装精确。

而且这类值用 `new Date()` 解析时**依赖运行时 TZ**：CST 下得 `23:00Z`，UTC 下得 `07:00Z`，差 8 小时。
所以脚本改成显式按列语义构造，**与运行环境时区无关**（已用 CST/UTC 双环境实测，结果一字不差）。

```bash
# ① 先看（只读）：逐条打印"原值 -> 结果"和解释依据
node scripts/fix-dates.mjs

# ② 人工核对抽样没问题后再写
node scripts/fix-dates.mjs --apply
```

预期输出：`待修正：100 条`（31 published_at + 69 个 datetime 列），
写完后 `integrity_check = ok`、`残留未归一：0`，再跑一次应显示 `待修正：0 条`（幂等）。

若某天时区不是 CST：`--tz=Asia/Shanghai` 可覆盖。

### 3. 安装部署

```bash
# 建专用用户（C14：原先以 root 运行）
sudo useradd --system --shell /usr/sbin/nologin --home /opt/blog blog
sudo chown -R blog:blog /var/lib/blog /var/www/blog-images

# 装新产物（用新的原子部署脚本）
sudo ./scripts/deploy.sh /tmp/blog-dist.tar.gz

# 探活
curl -s http://127.0.0.1:8090/api/healthz | head -c 300
```

### 4. 定时任务

```bash
sudo cp deploy/umami-sync.service deploy/umami-sync.timer /etc/systemd/system/
sudo cp deploy/blog-prune.service deploy/blog-prune.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now umami-sync.timer blog-prune.timer
```

`/etc/blog/umami.env`（600 root，含 token）：

```
UMAMI_API_URL=http://127.0.0.1:3000
UMAMI_WEBSITE_ID=<你的 site id>
UMAMI_TOKEN=<你的 api token>
```

### 5. 登录后立刻做两件事

1. **启用两步验证**：设置 → 两步验证 → 启用 → 扫码 → 输入验证码
2. **保存 8 个恢复码**（只显示一次）。丢了验证器还能用恢复码登录

> 这一条以前是空的：实测你库里 `totp_enabled = 0`，而 `deploy/README.md` 写着"账号密码 + TOTP 两步验证"。
> 现在代码支持真正的绑定流程，但**仍需你手动开启一次**。

---

## 二、CSP 切换（建议观察 3–7 天后再做）

默认只下发 `Content-Security-Policy-Report-Only`，不拦截任何东西。
因为全站在 JSX 里大量使用内联 `style`，强 CSP 会让界面失效。

```bash
# 观察期：看浏览器控制台有没有被拦的 report
# 确认干净后切强制模式：
sudo systemctl set-environment CSP_MODE=enforce
sudo systemctl restart blog
```

---

## 三、回滚

| 场景 | 操作 |
|---|---|
| 新版本有问题 | `sudo ./scripts/deploy.sh` 失败会自动切回；手工回滚：`ln -sfn <上一版> /opt/blog/current && systemctl restart blog` |
| 数据被时间修复写坏 | `systemctl stop blog` → 从 `/root/blog-backups/` 取最近归档还原 `/var/lib/blog/blog.db` → 起服务 |
| 想彻底退回 WordPress | 见 `deploy/README.md` 第八节（WordPress 文件与 wpdb 库都还在） |

---

## 四、上线后自检清单

```bash
# 1. 安全头
curl -sI https://blog.yghsite.cn/ | grep -iE 'content-security|x-content-type|x-frame'

# 2. 上传漏洞已修：伪造 HTML 必须 400
printf '<html><script>alert(1)</script>' > /tmp/evil.html
curl -s -o /dev/null -w '%{http_code}\n' \
  -F "file=@/tmp/evil.html;filename=evil.html;type=image/png" \
  -H "Cookie: blog_session=<你的会话>" \
  https://blog.yghsite.cn/api/admin/upload     # 期望 400

# 3. 限流按真实 IP（伪造 XFF 不再生效）
for i in $(seq 1 25); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST \
    -H 'Content-Type: application/json' -H "X-Forwarded-For: 1.2.3.$i" \
    -d '{"username":"flechazo","password":"wrong"}' \
    https://blog.yghsite.cn/api/auth/login
done; echo    # 第 11 次起应出现 429

# 4. 02:00 CST 发布的文章，前台显示当天（B1 回归）
#    后台新建一篇 → 把 published_at 改成凌晨 2 点 → 看前台日期

# 5. 发布后无需重启即生效
#    后台点"发布" → 前台刷新可见

# 6. 操作日志有记录
#    后台 → 日志，应看到刚才的上传/发布/登录

# 7. 内存没退化
systemctl show blog -p MemoryCurrent | awk -F= '{printf "%d MB\n", $2/1048576}'
```

---

## 五、这一版修了什么（对照方案）

| 编号 | 问题 | 状态 |
|---|---|---|
| A1 | 上传类型只信客户端 MIME → 同域 XSS → 后台沦陷 | 已修（magic bytes + 服务端定扩展名 + 拒绝 SVG） |
| A2 | 全站零安全头 | 已修（CSP + nosniff + XFO + Referrer-Policy） |
| A3 | 限流取可伪造的 XFF 首段 | 已修（只信 X-Real-IP，双维度计数） |
| A4 | ~~2FA 实际未开启~~ **上机核实后更正：线上 `totp_enabled=1`，本来就是开着的**。我最初误读了本地 dev 库（那份是旧副本）。 | 无需处理；但**恢复码为 0 个**，建议登录后去设置页生成一次，否则验证器丢失就锁死了 |
| A5 | 凭 Cookie 即可关 2FA / 改密 | 已修（step-up + 会话哈希 + 踢设备） |
| A6 | 无 middleware，鉴权靠手写 | 已修（proxy.ts 兜底 + requireAdmin 双层） |
| A7 | TOTP confirm 信客户端 secret | 已修（只信服务端 pending，15 分钟过期） |
| B1 | 0–7 点发布显示成前一天 | 已修（UTC 存储 + Intl 展示 + 数据修复脚本） |
| B3 | 草稿页面可公开访问 | 已修 |
| B4 | 归档只按年 | 已修（年→月两级） |
| B5 | 对不存在 id 谎报成功 | 已修（changes 检查 → 404） |
| B6 | 脏 JSON 让编辑页 500 | 已修（safeJsonArray） |
| B7 | 非法 type 撞 CHECK 抛 500 | 已修（校验层 → 400） |
| B8 | 改 slug 后旧链接 404 | 已修（别名表 + 301） |
| B9 | 评论网址可填 javascript: | 已修（协议白名单） |
| B10 | nginx 图片目录与 systemd 不一致 | 已上机核实：**线上本来就是 `/var/www/blog-images`，一致的**。仓库那份是过期副本，已修正 |
| C1 | 零审计日志 | 已修（audit_log + /admin/audit） |
| C2 | 零测试/CI | 已修（44 个测试 + CI + verify.sh） |
| C3 | 部署靠人肉 rm -rf | 已修（releases + 软链 + 探活自动回滚） |
| C4 | settings 表 0 引用 | 已修（真设置页 + 接入 layout/RSS/sitemap） |
| C5 | media 表只写不读 | 已修（媒体库 + 引用计数 + 孤儿扫描） |
| C6 | cover 不显示/无 og:image | 已修（封面上传 + openGraph/twitter） |
| C7 | 无粘贴/拖拽/自动保存 | 已修（含 Cmd+S、分屏预览、字数） |
| C8 | 列表无分页无搜索 | 已修 |
| C9 | 评论不能回复/批量 | 已修（parent_id 展示 + 批量审核） |
| C10 | 搜索 LIKE 全表扫 + 回传全文 | 已修（FTS5 trigram + 二字降级 LIKE） |
| C11 | 文章页 SSR 同步等 Umami | 已修（定时写回本地，渲染只读 SQLite） |
| C13 | DDL 两处重复 | 已修（单一迁移器） |
| C14 | systemd 以 root 运行 | 配置已改 User=blog，**需执行第 3 步** |
| P3-4 | 硬删除连带删评论 | 已修（软删除 + 回收站 + 彻底删除需 step-up） |

**未完成**：P4 的 ISR 全站改造。原因见下。

---

## 六、为什么没做 ISR（诚实说明）

方案里 P4 计划把 24 个 `force-dynamic` 页面改成 ISR + `revalidateTag`。实际动手后发现两个硬约束：

1. **构建期会读库**。Next 16 在 `next build` 时就会预渲染能静态化的页面，
   而这些页面直接读 SQLite —— 构建机上没有生产数据，会预渲染出空列表并冻进产物。
   要正确做，必须让数据读取走 `unstable_cache` 并配合 `dynamic = 'force-dynamic'` 之外的显式策略，
   属于一次架构改动，不适合塞在这轮里草率完成。
2. **收益比预想小**。原 README 里"改代码不生效 → 忘了 restart"说的是**代码**变更，
   不是内容变更；内容一直是实时读库的，发布即生效本来就是对的。
   真实收益只是降低每请求的 SSR 开销，而实测 58MB 内存完全撑得住。

**已交付的部分**：`revalidateTag`("posts"/"post:id"/"comments") 已在所有写接口接好，
`sitemap` 已改为 `revalidate = 3600`，Umami 耦合已解除（这项收益最大，已做）。
真要上 ISR，现在的 tag 基础已经铺好了，是独立的一次改造。


---

## 七、本次上线的实测记录（2026-10-21 18:5x CST）

以下都是在这个时点在线上机器上真实跑出来的，不是推断：

| 项 | 结果 |
|---|---|
| 时间数据修复 | 97 条归一，`integrity_check=ok`，二次运行 0 条（幂等） |
| 前台日期 | 修复前后显示**完全一致**（`2026年7月9日` 仍是 9 日），但 `dateTime` 从错误的 `17:38Z` 变成正确的 UTC 语义 |
| 上传漏洞 | HTML 伪装 → **400**；SVG → **400**；真 PNG 即便文件名叫 `evil.html` → **200 且落盘为 `.png`** |
| 限流 | 换 14 个伪造 XFF，第 **11** 次起稳定 429（旧代码此处无限通过） |
| 安全头 | `nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy` / CSP(Report-Only) 全部生效 |
| 鉴权 | `/admin` → 307，`/api/admin/posts` → 401 |
| 搜索 | 四字走 FTS，二字自动降级 LIKE，都能搜到 |
| 内存 | **54 MB**（升级前 113 MB），available 858 MB |
| 运行用户 | 已从 `root` 切到 `blog`；图片 8/8 仍 200（没有重演当年的 403） |
| 异地备份 | 修复了 409 失败，本地 2 份 / 异地 2 份 |
| 四站探活 | yghsite / blog / memos / coc 全部 200 |

上线过程中额外发现并修掉一个缺陷：上传去重只看 `media` 表而不确认文件是否还在磁盘上，
会导致「表里有记录、磁盘没文件」时返回一个 404 的 URL。已改为去重前先 `fs.access` 校验，
文件缺失则删记录重新写盘（已实测：删文件后再传会正常重新落盘）。
