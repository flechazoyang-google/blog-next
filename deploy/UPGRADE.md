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

## 六、P4 缓存：做了什么、什么没做

### 6.1 已生效：数据层缓存

`lib/cached.ts` 用 `unstable_cache` 包住 SQLite 读取，页面保持 `force-dynamic`。

**为什么不做整页 ISR**：这些页面直读 SQLite，若改成 `revalidate`，
`next build` 会在**构建机**上预渲染它们 —— 那里读的是开发库（31 篇旧文章），
会把错误内容冻进产物。这是实测确认的，不是保守估计。

**收益很小的诚实结论**：实测页面 18ms 中 SQLite 只占 **0.85ms**，
瓶颈是 React SSR。所以这层缓存的价值是"减少 DB 压力"，不是"提速网页"。

### 6.2 试过但已回滚：nginx 整页缓存

实测非常有效：**19ms -> 0.6ms，约 29 倍**。安全边界也全部验证通过：

| 场景 | 结果 |
|---|---|
| 普通首页 | MISS -> HIT -> HIT |
| 带 Cookie | BYPASS x3（登录态不缓存） |
| 带查询串 | BYPASS x3 |
| /admin、/search、POST | 不缓存 |

但正式上线失败：`/etc/nginx/sites-available/blog` 这个 server 块
**没有 `listen` 指令**，靠 nginx「首个无 listen 块作为端口默认」的隐式行为工作。
加入 `proxy_cache` 后，443 开始返回另一个 server 块的内容
（特征是 CSP 里出现 `'unsafe-eval'`，我们的配置里没有这个值）。
回滚后立即恢复，证明是改动引入的。

**已完整回滚**，仓库里的 `deploy/nginx-blog.conf` 已还原为线上实际内容。
未启用的附属文件放在 `deploy/pending-p4/`，附 README 说明前置条件。

### 6.3 结论

P4 按方案原样（整页 ISR）**没有做**，原因见 6.1；
nginx 整页缓存**试过且有效但未启用**，原因见 6.2。

若要继续，前置条件是先理清 blog 的 nginx 拓扑并补上显式 `listen`，
详见 `deploy/pending-p4/README.md`。

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


---

## 八、登录被锁怎么办

限流是「账号 15 次/15 分钟 + IP 30 次/15 分钟」双桶，登录成功会同时清零两个桶。
正常使用碰不到；但如果连续输错几次，或者自己拿接口做测试，就可能被自己锁住。

**解锁（立即生效，不用等）：**

```bash
cd /opt/blog && sudo -u blog DATA_DIR=/var/lib/blog node scripts/unlock.mjs --all
```

```bash
# 只看当前计数，不做修改
node scripts/unlock.mjs

# 只解某个账号
node scripts/unlock.mjs --account flechazo

# 只解某个 IP
node scripts/unlock.mjs --ip 1.2.3.4
```

被锁时登录页的报错信息里也会直接显示这条命令。

**阈值调整历史**：最初是「账号 10 次/小时」，实测发现对单人博客太苛刻（输错几次就锁一小时），
已改为 15 次/15 分钟，且登录成功后两个桶都清零。原来只清账号桶、不清 IP 桶，
会导致 IP 计数一直累积，早晚误伤。

**做接口测试时请注意**：验证限流请用不存在的用户名（例如 `nonexistent-test-user`），
同样能验证逻辑，又不会锁到真实账号。


---

## 九、统计脚本（Umami）的两个修复

### 9.1 控制台那条 preload 警告

```
The resource https://umami.yghsite.cn/script.js was preloaded using link preload
but not used within a few seconds from the window's load event
```

**根因**：`next/script` 在 `afterInteractive` 策略下，服务端只输出
`<link rel="preload">`，真正的 `<script>` 由客户端 `useEffect` 在 hydration
之后才插入。对跨域脚本来说，这就产生了「预加载了、但几秒内没被使用」的告警。

**这不只是噪音**：统计要等 hydration 完成才开始上报，首屏快速跳出的访问会被漏掉。

**已改为原生 `<script defer>`**：服务端直出执行标签，没有 preload/执行 的时间差，
告警消失，且 `defer` 同样不阻塞解析。

### 9.2 一个会真让统计失效的 bug（我自己引入的）

CSP 里 `script-src` 与 `connect-src` 原本**没有** `umami.yghsite.cn`：

```
script-src 'self' 'unsafe-inline'     <- 少了 umami
connect-src 'self'                    <- 少了 umami
```

原因：`next.config.ts` 在**构建期**求值，而 `NEXT_PUBLIC_UMAMI_SRC` 是 systemd
在**运行期**注入的 —— 构建机上没有这个变量，`umamiOrigin` 算出来是空串。

现在还是 Report-Only 所以没真拦，但**一旦按计划切成 `CSP_MODE=enforce`，
统计上报会被 CSP 直接拦掉，而且不会有明显报错**。

**已修**：给 `UMAMI_SRC` 一个默认值兜底，并支持 `CSP_EXTRA_ORIGINS` 追加额外源。
线上实测：

```
script-src 'self' 'unsafe-inline' https://umami.yghsite.cn
connect-src 'self' https://umami.yghsite.cn
```

### 9.3 同步任务已装好

之前 `settings` 里的 `umami:*` 一直是空的，因为定时任务从没装上。
现已启用 `umami-sync.timer`（每 5 分钟）与 `blog-prune.timer`（每小时）：

```bash
systemctl list-timers umami-sync.timer blog-prune.timer
/etc/blog/umami.env      # 600 root，含 UMAMI_TOKEN
```

首次同步已写入：`umami:total = 4`、3 条路径统计。

> **注意**：这个 4 是「修复前」的累计值 —— 说明统计脚本此前基本没在跑。
> 真正有意义的数字要从现在开始累积。
> 若要查历史真实访问量，Umami 后台（umami.yghsite.cn）里的数据更完整，
> 那里的采集一直是独立的，不受本站 CSP 影响。


---

## 十、验收记录与两个后续修复（2026-10-21 20:2x CST）

### 10.1 端到端验收（全部在线上真实执行）

| 功能 | 结果 |
|---|---|
| 文章列表分页/搜索/筛选 | 正常，搜索「霍夫」total=1 |
| 新建 → 前台可见 | 200 |
| 改 slug → 旧地址跳转 | **308 永久**（见下方修正） |
| 软删除 → 前台 404 → 回收站 → 恢复 | 全链路通过 |
| 未进回收站就彻底删除 | 正确拒绝：`请先移入回收站` |
| 评论提交 → 待审不可见 → 通过 → 可见 | 通过 |
| 评论 `javascript:` 网址 | 正确拒绝：`网址只支持 http/https` |
| 设置读写 | 正常，缓存即时失效 |
| 会话列表 | 正常，能标出「当前」会话 |
| 媒体库 | 18 张，引用计数正确 |
| 孤儿扫描 | 修复后 0 个 |

### 10.2 修正：别名跳转从 307 改为 308

验收时发现旧 slug 返回的是 **307（临时）**，而不是我在方案里写的 301。
原因是 Server Component 里的 `redirect()` 只能发 307；临时跳转**不会把 SEO 权重
与索引转移到新地址**，别名表就失去意义了。

已改用 `permanentRedirect()` → **308 永久**（语义等价 301，且保留请求方法）。
线上实测：旧地址 308，新地址 200。

### 10.3 补齐：把历史图片登记进 media 表

孤儿扫描报出「磁盘 18 张、库内 0 条、孤儿 18 个」——因为 `media` 表此前
**从来没有被写入过**（上传接口只写新图，WordPress 迁移来的 18 张从没登记）。

后果：媒体库是空的，这 18 张图也不受「删除前检查引用」的保护。

新增 `scripts/backfill-media.mjs`（默认 dry-run），已执行：

```bash
cd /opt/blog && sudo -u blog DATA_DIR=/var/lib/blog UPLOAD_DIR=/var/www/blog-images \
  node scripts/backfill-media.mjs --apply
```

结果：18 张全部登记，孤儿归零，引用计数正确（如 `write.png refs=1` → 受删除保护）。

> 这个脚本只需跑一次。以后新上传的图片由上传接口自动登记。


---

## 十一、CSP 运行期开关（2026-10-21 20:3x）

### 11.1 先修一个我自己写错的指令

原来文档里写的是：

```bash
sudo systemctl set-environment CSP_MODE=enforce && sudo systemctl restart blog
```

**这条命令无效。** 实测确认：以 `CSP_MODE=enforce` 启动后，响应头仍是
`Content-Security-Policy-Report-Only`。

根因：`next.config.ts` 的 `headers()` 在**构建期**求值，结果被固化成
`.next/routes-manifest.json`。运行期改环境变量对它完全不生效 ——
`CSP_MODE` 那段逻辑是死代码。这比"没做"更糟：你会以为切了，实际没有。

### 11.2 已改为运行期下发

CSP 现在由 `proxy.ts` 在每个请求上计算并下发（proxy 固定运行在 Node runtime，
每个请求都执行，能读到当时的 env）。`next.config` 只保留与 CSP 无关的静态头。

已验证：`routes-manifest.json` 里不再有任何 CSP 条目。

**现在的正确用法：**

```bash
# 观察期（默认，不拦截任何东西，只在控制台报违规）
sudo systemctl set-environment CSP_MODE=report-only

# 确认无违规后切强制
sudo systemctl set-environment CSP_MODE=enforce

# 每次改完都要重启
sudo systemctl restart blog

# 验证是否真的切了
curl -sI https://blog.yghsite.cn/ | grep -i content-security
#   report-only -> content-security-policy-report-only:
#   enforce     -> content-security-policy:
```

线上已双向实测：两种模式下响应头正确切换，页面 200、后台登录页 200。

---

## 十二、WordPress 已退役（2026-10-21 20:3x）

### 12.1 退役前的核对（结论：安全）

| 项 | 结果 |
|---|---|
| wpdb 内容 | 23 文章 / 8 页面 / 4 评论 / 37 表 / 9MB |
| 新站对应 | 23 文章 / 4 页面 / 1 评论 |
| 文章逐篇 | 一一对应（slug 差异仅因 WP 用 URL 编码、新站用明文） |
| 正文长度 | 纯文本对比 91%（差额全是被剥离的 HTML 标签，非内容丢失） |
| 坚果云 dump 复测 | **实际恢复到临时库验证过**：23/8/4/37 全部对上，含 `Dump completed` 收尾 |
| WP 文件归档 | 141MB，14029 个文件可正常列出 |

**那 6 个"缺失页面"不是内容**：归档/留言板/碎碎念/标签墙/站点地图/好友动态，
正文均为 0–129 字节的空壳（只有 `[wp:archives]` 之类的短代码），
新站已用原生功能替代（归档页 / 说说页 / 标签云 / sitemap.xml）。

**丢失的 3 条评论**：`:flower-heihei:` 表情、一句 SEO 垃圾留言、一个"？"，无保留价值。

### 12.2 执行了什么

```bash
systemctl stop mysql && systemctl disable mysql   # 先做可逆的
rm -rf /var/www/html/wordpress                    # 332MB
rm -rf /var/lib/mysql                            # 521MB
rm -f  /var/www/html/phpinfo.php                 # 历史遗留的敏感文件
apt-get purge mysql-server mysql-client php8.4-*  # 无业务再使用
rm -rf /etc/mysql /var/log/mysql*
```

### 12.3 收益

| 项 | 之前 | 之后 |
|---|---|---|
| 内存 available | 476 MB | **799 MB** |
| 磁盘占用 | 13 GB | **12 GB**（可用 25→26 GB） |
| mysqld 常驻内存 | 379 MB | 0 |
| 开机自启服务 | 含 mysql/php8.4 | 已移除 |

站点全部正常：四站 200、`/admin` 307、`/api/healthz` 200、nginx 语法检查通过。

### 12.4 如果需要恢复 WordPress

两份归档都在坚果云 `blog-migration-20261021/`：

```bash
# 1. 重装
apt-get install -y mysql-server php8.4-fpm php8.4-mysql

# 2. 恢复数据库（已实测可用）
rclone cat jianguoyun:blog-migration-20261021/wpdb-20261021.sql | mysql wpdb

# 3. 恢复文件
rclone cat jianguoyun:blog-migration-20261021/wordpress-files-20261021.tar.gz \
  | tar xzf - -C /var/www/html/

# 4. 恢复 nginx 站点配置（可从坚果云 configs-20261021.tar.gz 取）
```

> 注意：本机已 purge MySQL/PHP，恢复需要重新安装。若只是想查一条历史内容，
> 更快的办法是把 dump 恢复到任意一台有 MySQL 的机器上，不必动这台。

---

## 十三、评论系统换成 Artalk（2026-10-21 22:x）

### 13.1 访问信息

| 项 | 值 |
|---|---|
| 站点 | https://artalk.yghsite.cn |
| 管理后台 | **https://artalk.yghsite.cn/sidebar/** （v2 不是 /admin） |
| 管理员账号 | `flechazo`，密码见 `/opt/artalk/ADMIN_PASSWORD.txt`（600 root，**请改掉并存入密码管理器**） |
| 站点名（site） | `flechazo blog` ← 前端必须与此**完全一致**，否则报"未找到站点" |
| 部署位置 | `/opt/artalk/`（compose + data + artalk.yml） |
| 数据库 | SQLite `/opt/artalk/data/artalk.db` |
| 内存 | 实测 **10 MB** |

### 13.2 部署时踩的四个坑（都已解决）

1. **`db.type` 必须写 `sqlite`，不能写 `sqlite3`** —— 写 `sqlite3` 会 panic：`unsupported database type sqlite3`。
2. **配置文件路径是 `/data/artalk.yml`，不是 `/conf/`** —— 镜像 entrypoint 自动读它；
   若在 command 里传 `-c /conf/xxx.yml`，会顶掉默认的 `server` 子命令，容器起来就退出。
3. **`host` 要写 `0.0.0.0`** —— 写 `127.0.0.1` 时容器内只绑回环，宿主端口映射进不去（curl 000）。
4. **审核键名是 `moderator.pending_default`，不是 `moderator_pending`** ——
   写成顶层会被**静默忽略**，评论直接公开。这个最危险，因为不报错。实测改对后 `is_pending=1`。

另外 nginx 1.24 不支持独立的 `http2 on;`，必须写 `listen 443 ssl http2;`。

### 13.3 博客侧改动

- `components/CommentSection.tsx` 重写为 Artalk 客户端
  - 异步加载 `https://artalk.yghsite.cn/dist/Artalk.js`（198KB）
  - `pageKey` 用文章 slug 而非 id：换库/重建时评论不会错位
- `app/[slug]/page.tsx` 传入 `pageKey`
- **CSP 放行**（关键，漏了会"评论区空白"且无报错）：
  `next.config.ts` 的 `allowedOrigins` 已加入 artalk 域名，
  `script-src` / `connect-src` 均已验证包含。

### 13.4 旧评论系统

自研评论（`app/api/comments`、`comments` 表、后台评论审核页）**保留未删**，
但前端已不再调用。观察一段时间确认 Artalk 稳定后可清理。

原 2 条历史评论按要求**未迁移**。

### 13.5 常用命令

```bash
cd /opt/artalk
docker compose ps                 # 状态
docker logs -f artalk             # 日志
docker compose restart            # 重启
docker stats --no-stream artalk   # 内存
sudo cat /opt/artalk/ADMIN_PASSWORD.txt
```

### 13.6 备份（待补）

Artalk 数据在 `/opt/artalk/data/artalk.db`（单文件 SQLite）。
**当前 blog-backup 脚本不包含它**。若要纳入备份，在 `/usr/local/bin/blog-backup`
打包段加一行：

```bash
sqlite3 /opt/artalk/data/artalk.db ".backup '$TMP/artalk.db'"
```
