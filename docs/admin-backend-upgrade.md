# 博客管理后台升级方案

> 制定时间：2026-10-21 · 基于 `E:/agentWork/blog-next` 实际代码审计（非猜测，下文每条都给了文件行号）
> 线上：https://blog.yghsite.cn（Next.js 16 standalone + better-sqlite3，`blog.service` @ 127.0.0.1:8090）
> dev 库实测规模：31 条内容（23 文章 / 3 页面 / 5 说说）/ 5 评论 / 1 用户 / **0 媒体记录 / 0 设置行 / 0 会话行**

---

## 0. 审计结论（证据先行）

先说清楚"简陋"具体简陋在哪。后台的问题不是界面不好看，而是
**上传链路上有一条可直通管理员权限的真实路径、时间类数据正在静默出错、出问题后没有任何可追溯性、部署靠人肉记忆维持。**

### 0.1 P0：会真实丢权限的问题

| # | 问题 | 证据 | 后果 |
|---|---|---|---|
| A1 | **上传接口只信客户端 MIME，扩展名取自客户端文件名** | `app/api/admin/upload/route.ts:12,22,30`：校验用 `ALLOWED.has(file.type)`，落盘名用 `file.name.split('.').pop()` | 提交 `type=image/png` + 文件名 `evil.html`（或 SVG）即可通过校验，写进 nginx 直出的图片目录 → **同域存储型 XSS → 带管理员 Cookie 发同源请求 → 后台沦陷** |
| A2 | **全站零安全头** | 全库搜索 `Content-Security` / `Strict-Transport` / `X-Content-Type` / `X-Frame` → **0 命中**；`next.config.ts` 无 `headers()` | A1 的 XSS 没有任何兜底；`/images/` 下的 HTML 会被浏览器内容嗅探直接执行 |
| A3 | **限流的 IP 取自可伪造的 XFF 首段** | `route.ts` 取 `x-forwarded-for.split(',')[0]`；`deploy/nginx-blog.conf` 用 `proxy_add_x_forwarded_for`（把真实 IP **追加在客户端自报值之后**） | 每次换一个 XFF 头就绕过"5 次/15 分钟"登录限制与"3 条/10 分钟"评论限制 → **爆破面实际上无上限** |
| A4 | **两步验证其实没开** | 库内 users 实测：`id=1, username=flechazo, hash=$2a$12…, totp_enabled=0, totp_secret=NULL` | `deploy/README.md` 写着"账号密码 + TOTP 两步验证"，**与事实不符**；现在只有密码这一道 |
| A5 | **会话 Cookie 是唯一凭据，且凭它就能关掉 2FA** | `api/admin/totp/disable/route.ts` 只判 `currentUser()`；token 为 30 天固定值（`lib/auth.ts:8,59-69`），库里只存明文 token | Cookie 一旦泄露（A1+A2 即可造成）→ 攻击者立刻禁用 2FA、改密码、**把真管理员锁死** |
| A6 | **没有 middleware，鉴权靠每个文件手写一行** | 仓库无 `middleware.ts`（实测）；24 个文件各自 `export const dynamic = 'force-dynamic'` + 重复的 `if (!(await currentUser()))` | 新增一个路由忘记写这行 = **静默公开**，且没有任何机制会提醒 |
| A7 | **`/api/admin/totp/confirm` 用客户端传来的 secret 做校验** | `route.ts:11-16`：直接 `verifyTotp(secret, code)`，从不比对 `totp/start` 暂存的服务端值 | 绑定流程可被绕过；攻击者自带密钥对即可"完成启用"，事后真管理员的验证码全部失效 |
| A8 | 无 CSRF 纵深、无 Origin 校验 | 状态变更接口全依赖 Cookie，仅 `sameSite: 'lax'` | **要说句公道话：lax 目前挡住了跨站 POST，不可直接利用**；但缺 Origin 校验意味着策略一变即裸奔 |

### 0.2 P0/P1：现在就在悄悄错的数据问题（均已复现）

| # | 问题 | 复现证据 |
|---|---|---|
| B1 | **0–7 点发布的文章，前台显示成前一天** | `route.ts:36` 写入 `toISOString().replace('T',' ').slice(0,19)` = **UTC 且无偏移标记**；`PostCard.formatDate` 用 `new Date(str)` 按**本地时区**解析。实测：真 02:00 CST 发布 → 落库 `2026-10-20 18:00:00` → 前台显示 **2026年10月20日**（应为 21 日） |
| B2 | 三种时间格式混用，排序跨格式比较 | `created_at/updated_at` 用 SQLite `datetime('now')`（UTC，`lib/db.ts:37-38`）；`published_at` 用 JS 拼串；`lib/posts.ts` 里 `prevNextPost` 与首页 `ORDER BY COALESCE(published_at, updated_at)` 全按**字符串**比较，边界会乱 |
| B3 | **页面（page）无法下线** | `lib/posts.ts:28-32` `getPageBySlug` **没有** `status='published'` 条件 → 草稿状态的 page 直接公开可访问、可被搜索引擎收录 |
| B4 | 归档按年分组，变量名却叫 `ym` | `lib/posts.ts:47` `slice(0,4)` 是年份；`app/archives/page.tsx` 渲染成 `archive-year`。**月度维度整体丢失** |
| B5 | 评论操作对不存在的 id **谎报成功** | `api/admin/comments/[id]/route.ts:13-15`：`Number('abc') = NaN` → `WHERE id=NaN` 匹配 0 行，仍返回 `{ok:true}`。从不检查 `info.changes` |
| B6 | 脏 JSON 让编辑页一存就 500 | `api/admin/posts/[id]/route.ts:42-43` `JSON.parse(existing.categories)` 无 try/catch；库里若有非法 JSON 直接抛 |
| B7 | `type` 无校验 → 撞 CHECK 约束抛 500 | `api/admin/posts/route.ts:21` `b.type||"post"` 原样入 SQL；`type:"xyz"` 触发 `CHECK(type IN …)` 未捕获异常 |
| B8 | **改 slug 无重定向**，收录链接直接 404 | `posts/[id]/route.ts:38` 直接覆盖 slug；`lib/db.ts` 全部 7 张表里**没有别名/重定向表** |
| B9 | 评论 `url` 字段可填 `javascript:` | `api/comments/route.ts:46` 只 `slice(0,200)`；`CommentSection.tsx` 直接 `href={c.url}` → 存储型 XSS 的第二入口（虽需先过人工审核） |
| B10 | nginx 与 systemd 的目录**不一致** | `deploy/nginx-blog.conf:11` `alias /var/lib/blog/images/` vs `blog.service` `UPLOAD_DIR=/var/www/blog-images`（README 第 1089 行也强调必须是后者）→ 仓库副本有一处是错的，需与线上核对 |

### 0.3 P2/P3：功能缺失（"简陋"的主体）

| # | 缺什么 | 证据（搜索命中数） |
|---|---|---|
| C1 | **零审计日志**：谁在何时改/删了什么，事后无法追溯 | `audit_log` / `activity` / `logAction` → **0 命中** |
| C2 | **零测试 / 零 CI / 零 lint 配置** | `scripts` 只有 4 个 mjs；无 `.github/`、无 eslint 配置（`package.json` 有 `next lint` 但无配置文件，跑起来即报错） |
| C3 | 部署靠人肉 `rm -rf` + 服务器联网补依赖 | `deploy/README.md` "重新部署流程"：`npm install --no-save bcryptjs gray-matter` —— **运行时依赖没进 standalone 产物**；还要手工 cp Linux 版 `.node` 否则 invalid ELF header |
| C4 | **`settings` 表建了但 0 行、0 处引用**；`/admin/settings` 实为只有 TOTP 的空壳页 | `FROM settings` / `INTO settings` → **0 命中**；站名/描述硬编码在 `layout.tsx:13-14`、`rss.xml:14,24`、`sitemap.ts:5` |
| C5 | **`media` 表建了但 0 行、0 处查询**；无媒体库/删除/孤儿清理 | `FROM media` → **0 命中**（只在上传时 `INSERT OR IGNORE`，从不读） |
| C6 | `cover` 字段：API 支持、UI 不填、前台不显示、无 og:image | `cover` 仅出现在 `db.ts:34` 与 `route.ts:45`；`layout.tsx` 无 `openGraph` / `twitter` → 分享出去无卡片图 |
| C7 | 编辑器**无粘贴上传、无拖拽、无自动保存、无字数** | `onPaste`/`clipboard`/`onDrop`/`dragover` → **全部 0 命中**；而 README 第 1112 行承诺"拍照上传/直接粘贴" |
| C8 | 内容列表 `SELECT *.all()` 无分页无搜索 | `api/admin/posts/route.ts:10`、`admin/page.tsx:18` 全表载入后再 `filter()` |
| C9 | 评论不能回复、不能批量 | `parent_id` 字段存在但 UI/API 都没用；`bulk`/`selected` → **0 命中** |
| C10 | 搜索 = `LIKE '%q%'` 全表扫 + **回传整篇正文**再截断 | `api/search/route.ts:13-20`；单篇正文最大 13,871 B，响应体随内容线性膨胀 |
| C11 | **文章页在 SSR 路径里同步 await Umami** | `app/[slug]/page.tsx` `await getPageViews()` → `lib/site-stats.ts:31-55` 发外部 HTTP。Umami 是 Docker + 实测 344MB、这台机上最不稳定的邻居；**它一慢，文章页就慢/500** |
| C12 | **24 个文件全 `force-dynamic`**，静态为主的博客每请求都重渲染 + 查库 | 实测命中 24 文件；`revalidatePath` / `revalidateTag` → **0 处使用**（唯一 `revalidate` 是 `site-stats.ts:45` 的 fetch 选项，且与同函数 `cache:'no-store'` 自相矛盾） |
| C13 | 建表 DDL **两处各写一份**，无版本号无迁移器 | `lib/db.ts:22-95` 与 `scripts/init-db.mjs:16-90` 重复，改一处忘另一处即漂移 |
| C14 | `blog.service` 以 `User=root` 跑，无 `ExecReload`、无健康检查 | `deploy/blog.service:8`；OOM 时 `Restart=always` 之外无策略，恢复靠 5 秒后重启 |

---

## 1. 目标与非目标

**目标**
1. 堵住 A1–A8，把"凭一个 Cookie 即管理员"升级为"分层凭据 + 敏感操作二次验证"。
2. 修掉 B1–B10 的数据正确性问题，并提供一次性修复脚本（先备份、dry-run、可回滚）。
3. 补齐 C1（审计）、C2（测试 + CI）、C4/C5（设置页与媒体库真正可用）、C7（编辑器日常可用度）。
4. 让"后台点发布 → 前台生效"成为**可验证的自动闭环**，而不是靠 `systemctl restart`。

**非目标**（写清楚不做，防止范围膨胀）
- **不引入 NextAuth / Clerk 等外部鉴权框架**：单管理员场景依赖成本 > 收益，现有 TOTP 自研基础够用。
- **不做多用户 / RBAC**：只在 `users` 留 `role` 字段与迁移位，UI 不实现。
- **不迁移到 Postgres**：`README §17.2` 那 58MB 内存是这台机的核心战果，SQLite 保留。
- **不做 WYSIWYG 富文本**：Markdown 是作者既定工作流，只做增强不做替换。
- **不重构评论为独立线程模型**：沿用 `parent_id` 一级回复。

---

## 2. 关键架构决策

| 决策 | 选择 | 为什么这样选 |
|---|---|---|
| 鉴权收口 | `middleware.ts`（挡页面 + `/api/admin/*`）+ `requireAdmin()` helper（细粒度 + step-up）**双层** | middleware 早失败、省一次开库；但 Next middleware 不便做 TOTP 校验与写 Cookie，敏感操作仍需 handler 内判 → 两层互补而非重复 |
| 会话 | 保留 Cookie + SQLite；**库里只存 token 的 SHA-256**，新增 `auth_at` / `last_seen` / `user_agent` | 改动小、可回滚；拖库或备份泄露不再等于会话泄露，"踢设备"终于有数据可依 |
| 上传 | **magic-byte 嗅探 + sharp 重编码 + 扩展名由服务端决定**，彻底丢弃 `file.name` / `file.type` 作为命名依据 | 根因消除 A1，而不是玩黑名单游戏；重编码顺带剥 EXIF/GPS 与内嵌脚本 |
| 安全头 | `next.config.ts` `headers()`：全站一档，`/admin` + `/api/admin/*` 一档（含 `no-store`） | 根因消除 A2；给未来同类 XSS 留兜底 |
| 时间 | 库里统一存 **UTC ISO8601 带 Z**；展示层 `Intl.DateTimeFormat` + `Asia/Shanghai` | 消灭 B1/B2，带 Z 的串在任何运行时解析语义唯一 |
| 校验 | `zod`（约 60KB、无框架绑定），每个 route 一个 schema | 一次投入覆盖 B5/B7/B9 整类问题，并给 P2 的测试提供断言面 |
| 前台缓存 | ISR + `revalidateTag`（posts / post 单个 / comments），后台保存即精准失效 | 同时解决 C12 与"发布不生效"，降低每请求 SSR + 查库开销，**巩固 58MB 战果** |
| 统计 | Umami 改由 **systemd timer 定时拉取写回 `settings`**，渲染路径只读本地 | 消灭 C11 的耦合故障：统计挂了只影响数字新旧，不再影响文章可达性 |
| 迁移 | `lib/migrations/NNNN_name.ts` + `schema_version` 表，DDL 单一来源，迁移前自动快照 | 消灭 C13，让后续多次加表加列安全可重复 |

---

## 3. 分阶段实施

### P0 · 止血（0.5–1 天，纯加法为主，不动数据结构，可立刻发布）

**P0-1 上传漏洞（A1）** — `app/api/admin/upload/route.ts`
- magic bytes 判真实类型（PNG/JPEG/GIF/WEBP/AVIF 各自签名），**服务端决定扩展名**；`file.name` 只进日志。
- 明确拒绝 `image/svg+xml`（SVG 可携带 script，正是这条链路的经典载体）；确有需要时另设"剥离后入库"开关。
- `sharp` 重编码：`rotate()`（吃 EXIF 方向）+ `resize(withoutEnlargement, limit 2000)` + `quality 82`，同时产出缩略图。
- 体积上限 10MB → 8MB，并与 nginx `client_max_body_size 12m` 对齐；加**按天上传配额**，写入 `media`（顺手激活 C5 的一半）。
- CI 用例：PNG 内容 + `evil.html` 名 → 400；真 HTML 伪装 `type=image/png` → 400；SVG → 400；成功响应的 URL 扩展名必须是服务端指定的。

**P0-2 安全头（A2）** — `next.config.ts`
- 全站：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`（关掉 camera/mic/geolocation）。
- CSP 分两档；`/admin*` 与 `/api/admin*` 加 `Cache-Control: no-store`。
- **落地顺序是关键**：先跑 `Content-Security-Policy-Report-Only` 3–7 天再切 enforce（原因见 §5 风险 2 —— 全站大量使用内联 `style` 属性，直接上强 CSP 会把界面打回原形）。
- nginx 的 `/images/` 同步 `default_type application/octet-stream` + 关嗅探，与应用侧双保险。

**P0-3 真实 IP + 双维度限流（A3）**
- 新增 `lib/request-ip.ts`：`clientIp(req)` **只取 `x-real-ip`**（nginx 以 `$remote_addr` 设置，客户端无法伪造）→ 回退 XFF **最后一段** → `unknown`。
- 登录限流改为 **per-account + per-IP 双桶**；现在只按 IP，换 IP 即可对同一账号无限爆破。
- `nginx-blog.conf` 注释里写死"应用侧只信 X-Real-IP"——这是本项最容易复发的地方。

**P0-4 鉴权收口（A6）** — 新增 `middleware.ts`
- `/admin/*`（除 `/admin/login`）无会话 Cookie → 307；`/api/admin/*` 无 Cookie → 401 JSON。middleware 只判 Cookie 存在与格式，**不查库**。
- `lib/guards.ts`：`requireAdmin()` / `requireStepUp()`；24 处手写判断收敛为一次，**让"忘记写鉴权"这类 bug 在结构上不可能发生**。

**P0-5 step-up 与绑定流程（A5 / A7 / A8）**
- `totp/disable`、改密码、删除文章、批量删除：要求携带有效 TOTP 码，或 `auth_at` 在 10 分钟内，否则 **428**。
- `totp/confirm` 改为只校验服务端 `users.totp_pending`（`totp/start` 写入，15 分钟过期），**拒绝客户端提交的 secret**。
- 8 个一次性恢复码（`recovery_codes` 存哈希）——验证器丢失不至于永久锁死，这是启用 2FA 的前置条件而非可选项。
- `POST /api/admin/sessions/revoke-all` + 设置页"踢掉所有设备"。
- Origin/Referer 同源校验（对冲 A8 的策略性风险）。
- **顺带把 A4 变成真**：healthz 与 CI 断言 `totp_enabled=1`，让 README 的承诺与线上事实一致。

**P0-6** `getPageBySlug` 加 `AND status='published'`（B3）；管理员预览走 `?preview=1` + 会话校验。
---

### P1 · 数据正确性（1 天，**这是唯一一次改写历史数据**）

**P1-1 时间基准统一（B1 / B2）**
- 新增 `lib/time.ts`：`nowUtcIso()`（写入）、`toUtcIso(legacy)`（兼容库内三种历史形态：`datetime('now')` 无偏移、JS 拼串、已带 Z）、`formatCst(v, style)`（展示）。
- 写入一律显式传 JS 生成的 UTC ISO，不再依赖 `datetime('now')`（DB 默认值保留作兜底）。
- 展示侧全量替换：`PostCard.formatDate` / `toIso`、`archives` 的 `slice(5,10)`、`rss.xml` 的 `toUTCString`、`admin` 列表日期。
- 一次性脚本 `scripts/fix-dates.mjs`：**默认 dry-run** 打印前 20 条 + 影响总数，加 `--apply` 才写；单事务；任一步失败即从本次快照还原。执行前先跑一次现成的 `/usr/local/bin/blog-backup`（它已带 `integrity_check` + 空库自检）。
- 验收：写一篇 02:00 CST 的文章，前台日期 = 当天（**当前会显示成昨天**）；RSS `pubDate` 与页面一致；`prevNextPost` 上下篇顺序不变。

**P1-2 归档真正的年→月两级（B4）**：`listArchives()` 分组键 `slice(0,4)` → `slice(0,7)`，返回 `{year, months:[{ym, posts}]}`，`archives/page.tsx` 相应改渲染。现在 23 篇文章全挤在一个“2026”标题下。

**P1-3 zod 校验层（B5 / B7 / B9）**
- `id` → `z.coerce.number().int().positive()`；`type` / `status` → 枚举（现在 `type:"xyz"` 撞 CHECK 抛未捕获异常 = 500）；slug → 白名单正则（字母数字 + 连字符，长度 1–100）；title ≤ 200。
- 评论 `url` 限 `http:` / `https:` 前缀（B9：现在 `javascript:alert(1)` 能进库，而 `CommentSection` 直接 `href={c.url}`）；email 走格式校验。
- 所有 `UPDATE / DELETE WHERE id=?` 检查 `changes`，0 行 → **404**，不再返回 `{ok:true}`（B5）。
- 分类/标签读取统一 `safeJsonArray()`（B6），脏 JSON 不再让编辑页一存就崩。

**P1-4 slug 别名与 301（B8）**：新表 `post_aliases(slug PK, post_id, created_at)`；改 slug 时旧值入表；`getPostBySlug` 未命中回查别名 → 301 到新址（收录不断链）。别名与既有文章冲突时返回 409 并提示，不静默覆盖。

**P1-5 核对并消除 B10 的目录漂移**：确认线上生效的 nginx `/images/` alias 与 `UPLOAD_DIR` 一致，仓库副本必须与线上一字不差。

---
### P2 · 可运维性（1–2 天）

**P2-1 迁移器（C13）**
- `schema_version(id, name, applied_at)` + `lib/migrations/0001_baseline.ts` 起编号，`up()` 幂等；`getDb()` 启动时按序补齐。
- `scripts/init-db.mjs` 改为调用同一迁移器，**删掉那份重复 DDL**（今后不再存在两份表结构）。
- 迁移前自动做在线快照（复用 `deploy/blog-backup` 已有的 `sqlite3 .backup` 逻辑），失败可原样还原。

**P2-2 审计日志（C1）**
- 新表 `audit_log(id, actor_user_id, action, target_type, target_id, meta_json, ip, user_agent, created_at)`，索引 `(created_at DESC)`、`(target_type, target_id)`。
- 在 `requireAdmin()` 里注入 `audit(action, meta)`：登录成功/失败、改密、TOTP 启停、发布/更新/删除、评论审核、上传、批量操作、会话吊销。
- `/admin/audit` 只读页（按动作 / 目标 / 日期筛选，100 条一页），**不提供删除接口**。
- 保留 180 天，由 `blog-backup` 顺带清理。
- 为什么排 P2 而不是 P3：没有它，将来任何“文章怎么没了”都只能靠猜。它是**排障能力**，不是功能装饰。

**P2-3 测试 + CI（C2）—— “从玩具到工程”的分水岭**
- `vitest` 直接打 route handler；SQLite 用临时文件库（**不用 `:memory:`**，保持与生产 WAL 行为一致）。优先把 P0/P1 每一条都钉成回归用例：

```bash
tests/security/upload.test.ts    # 伪造 MIME / evil.html / svg / 超配额   -> A1 哨兵
tests/security/auth.test.ts      # 无 Cookie 401、限流按 X-Real-IP、step-up 428、恢复码单次使用
tests/security/headers.test.ts   # CSP / nosniff 存在性与分档正确
tests/api/posts.test.ts          # type 非法->400、不存在 id->404、slug 冲突自动加序号、别名 301
tests/lib/time.test.ts           # 02:00 CST 发布 -> 前台日期不跳回昨天  -> B1 哨兵
tests/lib/search.test.ts         # 中文词级召回 + 只回传摘要
```

- CI（`.github/workflows/ci.yml`；仓库当前**无远端**，若暂不建远端则先落 `scripts/verify.sh` 承担同一职责 + pre-push 钩子）：
  `tsc --noEmit` → `eslint`（补 `eslint-config-next`，现在 `npm run lint` 因缺配置文件直接报错）→ `vitest run` → `next build` → **在 ubuntu 容器里跑一次 FTS5 冒烟**（顺带闭环 §5 风险 1）。
- 部署脚本化 `scripts/deploy.mjs`，取代 README 里那段人肉流程：

```bash
本地 build -> package-standalone -> tar（带 sha256）
  -> 上传 /opt/blog/releases/<git-sha>/ -> 原子切软链 current
  -> systemctl restart blog -> 探活 /api/healthz + 首页 200
  -> 失败自动切回上一版并 exit 1
```

- 附带修掉一个真实缺陷：README 要求在服务器上执行 `npm install --no-save bcryptjs gray-matter`，说明**这两个运行时依赖根本没进 standalone 产物**，于是每次发布都要联网且极易漏步。改由 `package-standalone.mjs` 显式打入，取消服务器侧安装；Linux 原生 `.node` 随 release 目录一起版本化，README 那条 “invalid ELF header” 手工 cp 的坑随之消失。
- **`/api/healthz**：DB 可读写、内容计数、`schema_version`、进程 RSS、`totp_enabled`。给探活与外部监控使用。
- **systemd 加固（C14）**：新建 `blog` 系统用户，`User=blog` 并 chown `/var/lib/blog` + `/var/www/blog-images`；补 `ExecReload`、`LimitNOFILE=65536`、`OOMPolicy=continue`、`PrivateDevices=true`、`CapabilityBoundingSet=`、`ProtectKernelTunables=true`。

---
### P3 · 后台可用性（2–3 天，日常体感提升最大）

**P3-1 设置页真正落地（C4）**：启用 `settings` 表 + `lib/settings.ts`（进程内缓存，写即失效）。可编辑站名 / 副标题 / 描述 / 作者 / 页脚 / 备案 / 友链（把 `content/pages/friend-links.md` 一并纳入）、评论开关（全站 + 单篇）、RSS 开关。替换硬编码点：`app/layout.tsx:13-14`、`app/rss.xml/route.ts:14,24`、`app/sitemap.ts:5`、`lib/auth.ts:50`（TOTP issuer）。`/admin/settings` 从“只有 TOTP 的空壳”变成 账号 / 站点 / 评论 / 安全 四卡片。

**P3-2 媒体库（C5）**：`/admin/media` 网格浏览 + 每张图的**被引用计数** + 时间/体积排序 + 删除（未被引用才允许删文件与行）+ “扫描孤儿文件”（对比 `/var/www/blog-images` 与 `media` 表）。编辑器“图片”改为**上传 / 从库选**双入口带搜索。

**P3-3 编辑器（C7 / C6）**：`onPaste` 粘贴上传 + 拖拽上传 + 多图并发带进度（README 早就写了“可直接粘贴图片”，代码里 0 实现）；`localStorage` 草稿快照（debounce 1s、进页面提示恢复）、`Cmd/Ctrl+S` 保存、`Cmd+B/I` 包裹；`useDeferredValue` 驱动 `/api/preview` 做分屏实时预览（现在是点一次刷一次）；补 `cover` 上传与字数统计，并在文章页下发 `og:image` / `twitter:card`（现在分享出去无卡片图）。

**P3-4 列表、批量与回收站（C8 / C9）**：`/api/admin/posts` 支持 `q/type/status/sort/limit/offset` + 返回 `total`，列表服务端分页（含草稿搜索——现在只能在前端已有的全量数组里看）。批量：多选 → 发布 / 转草稿 / 删除（删除走 step-up）。

> **删除必须改软删除** `posts.deleted_at` + 回收站保留 30 天。当前是硬 `DELETE`，而 `comments.post_id` 带 `ON DELETE CASCADE` —— 删一篇文章会**连带删光它的全部评论且不可恢复**。这是整个后台里数据丢失风险最高的一个按钮，而现在它连二次确认都没有。

评论：用起 `parent_id`（一级回复）、邮箱 Gravatar、批量通过/垃圾、按 IP 拉黑、同 IP 累计 3 条 spam 自动转垃圾。

**P3-5 搜索（C10）**：FTS5 外部内容表 + INSERT/UPDATE/DELETE 触发器同步，`bm25` 排序，只回传 title/slug/摘要（不再回传整篇正文——现在单篇最大 13,871 B 全量进响应）。中文注意：`unicode61` 会把中文连续串当成单个 token，词级召回不足 → 用 `trigram`（SQLite 3.34+，产物实测捆绑 3.53.2）或“FTS5 + LIKE 兜底”混合。`/api/search` 与 `app/search/page.tsx` 保持返回结构不变。

---

### P4 · 性能与韧性（1 天，放最后）

- **前台 ISR + tag 精准失效（C12）**：首页 / `archives` / `tags` / `[slug]` 由 `force-dynamic` 改为 `revalidate` + `revalidateTag`，后台保存即精准失效。**“点发布 → 前台可见”不再需要 `systemctl restart`**（README 排障表里那条“改代码不生效”从流程上消失），每请求 SSR + 查库开销下降，直接巩固 58MB 战果。
- **Umami 解耦（C11）**：改 systemd timer 每 5 分钟拉取并写回 `settings`（`umami:total`、`umami:path:<slug>`），渲染路径只读本地值。**Umami 容器抖动不再拖死文章页**（现在每个文章页 SSR 都同步 await 一次对 344MB Docker 服务的外部 HTTP）。顺带清掉 `lib/site-stats.ts` 里 `cache:'no-store'` 与 `next:{revalidate:300}` 自相矛盾的写法。
- 会话与限流定期清理：现在 `sessions` 只在被访问到时惰性删除（实测 dev 库 0 行，线上会单调增长）→ 每小时批量清过期；`rate_limits` 同理。
- `api/admin/posts/route.ts:11` 的 SELECT 里 `type` 列写了两遍，顺手去掉。

---

## 4. 落地顺序与工作量

| 阶段 | 覆盖条目 | 估时 | 风险 | 能否独立发布 |
|---|---|---|---|---|
| **P0** | A1 A2 A3 A4 A5 A6 A7 A8 + B3 | 0.5–1 天 | 低（几乎纯加法） | 当天可发 |
| **P1** | B1 B2 B4 B5 B6 B7 B8 B9 B10 | 1 天 | **中**（改写历史数据） | 备份后发 |
| **P2** | C1 C2 C3 C13 C14 + healthz | 1–2 天 | 低 | 可 |
| **P3** | C4 C5 C6 C7 C8 C9 C10 | 2–3 天 | 低 | 可再拆 3 次 |
| **P4** | C11 C12 + 清理 | 1 天 | **中**（缓存策略需观察） | 灰度 |

**总计 6–8 天。** 顺序不建议调换的理由：

1. P0/P1 是安全与数据地基，先止血；
2. **P2 的测试 + CI 必须赶在 P3 大改功能之前就位** —— 当前仓库 0 测试，P3 那批改动（软删除、批量、FTS 触发器）若没有回归保护网，就是在裸奔；
3. P4 的缓存改造放最后，因为“内容没更新”这类故障需要 P2 的审计日志与 healthz 来定位。

每一项都可单独 revert：P0 是加法 + 局部替换，P1 自带备份与 dry-run，P2/P3 是新模块，P4 是策略开关。

---
## 5. 风险与对策

1. **FTS5 在 Linux 生产产物里是否可用，尚未验证。** Windows 侧二进制已探到 `fts5` / `unicode61` / `trigram` 符号，`better-sqlite3` 12.11.1 捆绑 SQLite **3.53.2**，`binding.gyp` 未关闭任何特性 → 大概率可用。但生产 `.node` 是在 Linux 上另行编译的（README 里那次手工覆盖），**必须先在 CI 的 ubuntu 容器跑一次 `CREATE VIRTUAL TABLE … fts5` 冒烟**。失败则退化为“内容表 + LIKE 兜底”，P3-5 单独改，不影响其他阶段。

2. **CSP 的 `style-src` 是本项目最可能翻车的一项。** 全站在 JSX 里大量使用内联 `style` 属性（`AdminShell`、`RightBar`、`[slug]/page.tsx` 的动态分类色、`PostCard` 的 `cat-pill`），浏览器视为内联样式。若直接下发强 CSP，界面会大面积失效。**处置：先 Report-Only 观察 3–7 天**，确认违规清单后再决定是放行 `style-src 'unsafe-inline'`（务实、仍有 script 侧收益）还是改造内联样式。`script-src` 可先严格（Next 需要 nonce 或 `next/script`，若要 nonce 则与 P4 一起做）。

3. **`sharp` 会引入第二个原生模块——这点要谨慎。** 本项目的部署已经因 `better-sqlite3` 的原生模块吃过 “invalid ELF header”，再加一个跨平台编译依赖等于把这个坑复制一遍。因此：
   - **P0-1 的核心防护不依赖 sharp**：magic-byte 嗅探 + 服务端指定扩展名 + 响应与 nginx 都下发正确 `Content-Type` + `nosniff`，已足以消除同域 XSS。这是必须做的部分。
   - sharp 仅作为**可选增强**（缩略图、EXIF 剥离、体积压缩），放 P3-2 与媒体库一起做，并纳入 P2-3 的版本化 release 目录流程。**若不愿再加原生依赖，跳过 sharp 不影响安全性达标。**

4. **P1-1 改历史时间戳是唯一一次不可逆数据写。** `blog-backup` 已带 `integrity_check` + 空库自检，但**执行前要先做一次恢复到临时库的对照**（README §3.3 的演练脚本 2026-10-21 已跑通，可直接复用）。`fix-dates.mjs` 默认 dry-run，加 `--apply` 才写。

5. **systemd 切 `User=blog`** 后 `/var/lib/blog`、`/var/www/blog-images`、`/opt/blog` 属主要一并 chown；nginx 读图依赖 www-data 权限，改完必须实测图片 200（历史上已因权限踩过 403，见 README 第 1083 行）。回滚：`User=root` + `daemon-reload` + `restart`，一条命令。

6. **P2-3 部署改造期间线上照常服务**，故先双轨运行 2 次发布：对比新产物与旧手工流程等价（`dist` 内是否已含 `bcryptjs` / `otpauth`、Linux `.node` 是否随 release 版本化、冷启动 `node -e "require('better-sqlite3')"` 通过），确认后再删旧说明。

7. **内存红线。** 这台机 available 常在 300–450 MiB，Umami 已占 344 MB。任何新增（P4 的 timer、P2 的 CI 构建、可选 sharp）都必须复核 `systemctl show blog -p MemoryCurrent`，**不得让博客从 58 MB 涨回三位数**，否则这次迁移的收益就白拿了。

---

## 6. 验收清单（安全项全部脚本化，进 CI）

**安全**
- [ ] 伪造 `file.type` 上传 `.html` / `.svg` / `.exe` → 全部 4xx，磁盘无残留
- [ ] `curl -I https://blog.yghsite.cn/` 能看到 `content-security-policy` 与 `x-content-type-options: nosniff`
- [ ] 带伪造 `X-Forwarded-For: 1.2.3.4` 连打 30 次登录 → 第 6 次起稳定 429（证明限流按 `X-Real-IP`）
- [ ] 仅凭会话 Cookie 调 `totp/disable` → 428；附带有效 TOTP 码 → 200
- [ ] 未登录访问 `/admin`、`/admin/edit/1` → 307；`/api/admin/posts` → 401（由 middleware 兜底，而非各文件手写）
- [ ] `totp/confirm` 提交**非服务端 pending** 的 secret → 400
- [ ] 评论 `url: "javascript:alert(1)"` → 400 且不落库
- [ ] 恢复码单次使用：用第二次 → 401
- [ ] 线上 `users.totp_enabled = 1`（让 README 的“两步验证”承诺与实际相符）

**数据**
- [ ] 02:00 CST 发布的文章，前台显示当天；RSS `pubDate` 与页面一致
- [ ] 草稿状态的 page 前台 404；管理员带 `?preview=1` 可见
- [ ] 改 slug 后旧地址 301 到新址
- [ ] `/api/admin/posts/999999` → 404；`type:"xyz"` → 400；`/api/admin/comments/abc` → 400（不再谎报 ok）
- [ ] 归档页出现年 → 月两级

**运维**
- [ ] `npm run test` + `npm run build` 在 CI 全绿；`tsc --noEmit` 0 error
- [ ] 后台点“发布”→ 30 秒内前台可见，**全程不碰 `systemctl restart`**
- [ ] 部署不再需要服务器联网 `npm install --no-save`；回滚 = 切软链 + restart
- [ ] `/api/healthz` 200，内容含 `schema_version` 与 RSS
- [ ] **停掉 Umami 容器后**，文章页响应时间不退化（`curl -w '%{time_total}'` 前后对比）
- [ ] `/admin/audit` 能查到刚才自己每一步操作（含 IP）
- [ ] `systemctl show blog -p MemoryCurrent` ≤ 200 MB，`free -m` available ≥ 300 MiB

---

## 7. 与现有文档的冲突（须同步修订）

| 位置 | 现在的说法 | 事实 | 处理 |
|---|---|---|---|
| `deploy/README.md` §四 | “登录（账号密码 + TOTP 两步验证）” | `totp_enabled=0`，**只有密码** | P0-5 后为真；文档标注“2FA 已强制 + 恢复码已生成” |
| `deploy/README.md` §四 | “可直接粘贴图片” | 无 `onPaste` 实现 | P3-3 补齐，否则删掉这句 |
| `deploy/README.md` §七 | “改代码不生效 → 是否忘了 restart” | 根因是全站 `force-dynamic` + 发布无版本化 | P2/P4 从流程上消除，不该留成排障条目 |
| `deploy/README.md` 重新部署 | `npm install --no-save bcryptjs gray-matter` | 运行时依赖未打进产物，属构建缺陷 | P2-3 修 `package-standalone.mjs` |
| `nginx-blog.conf` | `/images/` alias 指向 `/var/lib/blog/images/` | 服务实际写 `/var/www/blog-images` | B10：核对线上后统一 |
| `README.md`（服务器清单）§17 | “后台：Markdown 编辑器 + 拍照上传 + TOTP” | 同上三项均与代码/数据不符 | 阶段收口时一并更正 |

---

## 8. 一句话摘要

前台已经打磨得足够细，后台要补的不是界面，而是：
**① 一条被忽视的 上传伪造 → 同域 XSS → 管理员沦陷 链路**（P0，半天可堵，且当前 2FA 实际没开，等于只有一层密码）；
**② 一个正在静默把凌晨文章显示成昨天的时区缺陷**，以及页面无法下线、删文章连评论一起永久删除（P1，一天）；
**③ 可追溯性（审计日志）、回归保护（测试 + CI）、自动化发布**这三件让“简陋”变“可靠”的地基（P2）；
剩下的媒体库、真设置页、批量与回收站、FTS 搜索、发布即生效（P3/P4）才是日常体感。

> 本方案仅为计划，**未改动任何代码或数据**。确认后按 P0 → P1 → P2 → P3 → P4 逐阶段实施，每阶段独立可发布、可回滚。
