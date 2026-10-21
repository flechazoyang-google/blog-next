import { getDb } from "./db";

export type Stat = { label: string; value: string; icon: string };

/**
 * 站点统计。
 * Umami 尚未部署，访问量先用虚拟值占位（UMAMI_ENABLED=false 时）。
 * 部署后把 UMAMI_ENABLED 置为 true，并在此接入 Umami API。
 */
export function getSiteStats(): Stat[] {
  const db = getDb();
  const c = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  const posts = c("SELECT COUNT(*) c FROM posts WHERE type='post' AND status='published'");
  const shuo = c("SELECT COUNT(*) c FROM posts WHERE type='shuoshuo' AND status='published'");
  const comments = c("SELECT COUNT(*) c FROM comments WHERE status='approved'");

  // 站点运行天数：从最早一篇文章算起
  const first = db.prepare(
    "SELECT MIN(published_at) m FROM posts WHERE type='post' AND status='published'"
  ).get() as { m: string | null };
  let days = 0;
  if (first?.m) {
    const start = new Date(first.m.replace(" ", "T")).getTime();
    if (!isNaN(start)) days = Math.max(1, Math.floor((Date.now() - start) / 86400000));
  }

  // TODO: Umami 部署后替换为真实数据
  const views = 12800 + posts * 73;

  return [
    { label: "文章", value: String(posts), icon: "📝" },
    { label: "说说", value: String(shuo), icon: "💬" },
    { label: "评论", value: String(comments), icon: "🗨" },
    { label: "运行", value: days + "天", icon: "⏳" },
    { label: "访问", value: views >= 10000 ? (views / 10000).toFixed(1) + "w" : String(views), icon: "👁" },
  ];
}

export type TagItem = { name: string; count: number; size: number };

/** 标签云：按出现次数映射字号（0.72 ~ 1.0 rem） */
export function getTagCloud(limit = 18): TagItem[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT tags FROM posts WHERE type='post' AND status='published'"
  ).all() as { tags: string }[];

  const counter = new Map<string, number>();
  for (const r of rows) {
    let arr: string[] = [];
    try { arr = JSON.parse(r.tags || "[]"); } catch {}
    for (const t of arr) {
      const name = String(t).trim();
      if (!name) continue;
      counter.set(name, (counter.get(name) || 0) + 1);
    }
  }

  const list = [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const max = list[0]?.[1] || 1;
  return list.map(([name, count]) => ({
    name,
    count,
    size: 0.72 + (count / max) * 0.28,
  }));
}
