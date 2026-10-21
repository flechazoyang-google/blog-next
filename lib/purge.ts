import fs from "node:fs/promises";
import path from "node:path";
import { revalidateTag } from "next/cache";

/**
 * 内容变更后的缓存失效（方案 P4）。
 *
 * 分两层，但**当前只有第 1 层在实际工作**：
 *
 *   1) Next 数据缓存：revalidateTag —— 已生效（lib/cached.ts 的 unstable_cache 用它）
 *   2) nginx 整页缓存：touch 标记文件 -> systemd path 单元 -> purge-cache.sh
 *      **尚未启用**。原因：blog 的 nginx server 块缺显式 listen 指令，
 *      加 proxy_cache 后 443 会落到别的 server 块（实测过，已回滚）。
 *      相关文件暂放在 deploy/pending-p4/，等拓扑理清后再开。
 *
 * 所以 ENABLE_PAGE_CACHE_PURGE 默认 false：不写无意义的标记文件。
 * 将来启用 nginx 缓存时，把它设成 "1" 并安装 deploy/pending-p4/ 下的单元即可。
 */
const ENABLE = process.env.ENABLE_PAGE_CACHE_PURGE === "1";
const HINT =
  process.env.PURGE_HINT ||
  path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), ".purge-hint");

/** 只清 Next 数据缓存（当前唯一生效的一层） */
export function invalidate(tags: string[], profile = "max"): void {
  for (const t of tags) revalidateTag(t, profile);

  if (!ENABLE) return;
  void fs
    .writeFile(HINT, new Date().toISOString(), "utf8")
    .catch((e) => console.warn("[purge] 无法写入页面缓存清理标记（不影响功能）:", (e as Error).message));
}
