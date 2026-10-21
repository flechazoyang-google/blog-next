import { getDb, ftsAvailable } from "./db";
import { getSettings } from "./settings";
import { dateKeyIn } from "./time";

export type Stat = { label: string; value: string; icon: string };

/**
 * 站点统计（方案 C11）。
 *
 * 原实现：文章页 SSR 期间**同步 await 一次外部 HTTP**（Umami），
 * 而 Umami 是这台机上最不稳定的邻居（Docker，实测 344MB）。
 * 它一慢，文章页就慢；它一挂，文章页就 500。
 *
 * 现在：Umami 的数值由 systemd timer 定时拉取后写回 settings（scripts/sync-umami.mjs），
 * 渲染路径只读本地 SQLite —— 统计服务抖动最多让数字变旧，不再影响可达性。
 */
export function getSiteStats(): Stat[] {
  const db = getDb();
  const c = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  const posts = c("SELECT COUNT(*) c FROM posts WHERE type = 'post' AND status = 'published' AND deleted_at IS NULL");
  const shuo = c("SELECT COUNT(*) c FROM posts WHERE type = 'shuoshuo' AND status = 'published' AND deleted_at IS NULL");
  const comments = c("SELECT COUNT(*) c FROM comments WHERE status = 'approved'");

  const first = db.prepare(
    "SELECT MIN(published_at) m FROM posts WHERE type = 'post' AND status = 'published' AND deleted_at IS NULL"
  ).get() as { m: string | null };
  let days = 0;
  if (first?.m) {
    const start = new Date(first.m).getTime();
    if (!isNaN(start)) days = Math.max(1, Math.floor((Date.now() - start) / 86400000));
  }

  const s = getSettings();
  const views = s.umamiTotal ? Number(s.umamiTotal) : NaN;
  const viewsText = Number.isFinite(views)
    ? views >= 10000 ? (views / 10000).toFixed(1) + "w" : String(views)
    : "—";

  return [
    { label: "文章", value: String(posts), icon: "📝" },
    { label: "说说", value: String(shuo), icon: "💬" },
    { label: "评论", value: String(comments), icon: "🗨" },
    { label: "运行", value: days + "天", icon: "⏳" },
    { label: "访问", value: viewsText, icon: "👁" },
  ];
}

/** 单篇浏览量：读本地缓存（键 umami:path:<slug>），未同步过则为 null */
export function getPageViews(pagePath: string): number | null {
  const raw = getSettingsRaw("umami:path:" + pagePath);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getSettingsRaw(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** 首页批量取浏览量：一次查询拿全，避免 N+1 */
export function getViewsMap(): Map<string, number> {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key LIKE 'umami:path:%'")
    .all() as { key: string; value: string }[];
  const map = new Map<string, number>();
  for (const r of rows) {
    const n = Number(r.value);
    if (Number.isFinite(n)) map.set(r.key.slice("umami:path:".length), n);
  }
  return map;
}

export type TagItem = { name: string; count: number; size: number };

/** 标签云：按出现次数映射字号（0.72 ~ 1.0 rem） */
export function getTagCloud(limit = 18): TagItem[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT tags FROM posts WHERE type = 'post' AND status = 'published' AND deleted_at IS NULL"
  ).all() as { tags: string }[];

  const counter = new Map<string, number>();
  for (const r of rows) {
    let arr: string[] = [];
    try {
      const v = JSON.parse(r.tags || "[]");
      if (Array.isArray(v)) arr = v.map(String);
    } catch {
      // 脏数据跳过，不让标签云整块消失
    }
    for (const t of arr) {
      const name = t.trim();
      if (!name) continue;
      counter.set(name, (counter.get(name) || 0) + 1);
    }
  }

  const list = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = list[0]?.[1] || 1;
  return list.map(([name, count]) => ({ name, count, size: 0.72 + (count / max) * 0.28 }));
}

export function searchReady(): boolean {
  return ftsAvailable();
}

export { dateKeyIn };
