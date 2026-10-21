# 未启用的 P4 附属文件

这里的文件**没有部署到线上**。它们在一次尝试后被回滚，保留是为了将来拓扑理清后再启用。

## 为什么没启用

nginx 整页缓存本身实测有效：**19ms -> 0.6ms，约 29 倍**，
且安全边界验证通过（带 Cookie / 带查询串 / /admin / /search / POST 全部 BYPASS）。

但正式上线时出问题：

1. `/etc/nginx/sites-available/blog` 这个 server 块**没有 `listen` 指令**，
   依靠 nginx「首个无 listen 的 server 块作为该端口默认」的隐式行为工作。
2. 在其中加入 `proxy_cache` 后，443 开始返回**另一个 server 块的内容**
   （特征是 CSP 里出现 `'unsafe-eval'`，而我们的配置里没有）。
3. 回滚配置后立刻恢复正常，证明是这次改动引入的。

## 要启用前必须先做的事

1. 查清 blog.yghsite.cn 的 443 实际由哪个 server 块处理：
   `nginx -T | grep -n "server_name|listen"` 对照，
   并确认 certbot 是否在别处生成了一个包含该域名的 TLS 块。
2. 给 blog 的 server 块补上**显式**的
   `listen 443 ssl; listen [::]:443 ssl;` + `ssl_certificate` 两行，
   让配置自解释，不再依赖"首个块兜底"这种隐式行为。
3. 再按先后顺序启用：先 `nginx-blog-cache.conf`（http 层声明）→ reload →
   验证 `X-Cache-Status` 出现 → 再启用 server 块里的 `proxy_cache`。
4. 每步都先 `nginx -t`，并且保留 `/root/blog-backups/nginx-blog.before-cache` 这份锚点。

## 文件说明

| 文件 | 作用 |
|---|---|
| `nginx-blog-cache.conf` | `proxy_cache_path` 声明，**必须**放 `/etc/nginx/conf.d/`（http 层） |
| `blog-purge.path` | 监听 `/var/lib/blog/.purge-hint`，内容变更后自动清缓存 |
| `blog-purge.service` | 调 `purge-cache.sh` |
| `purge-cache.sh` | 删缓存目录（本机 nginx 没编译第三方 purge 模块） |

对应地，`lib/purge.ts` 里的页面缓存清理是**默认关闭**的
（`ENABLE_PAGE_CACHE_PURGE=1` 才写标记文件）。

## 当前实际生效的部分

只有 `lib/cached.ts` 的**数据层缓存**（unstable_cache + revalidateTag）。
它不改变渲染模型、不影响构建期，页面仍然是动态渲染。

实测收益很小：页面 18ms 里 SQLite 只占 0.85ms，瓶颈是 React SSR。
所以它主要价值是"减少 DB 压力"，不是"提速"。
