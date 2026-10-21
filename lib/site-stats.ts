import { getDb } from "./db";

export type Stat = { label: string; value: string; icon: string };

/** 从 Umami 读取总访问量；未配置或失败时返回 null */
async function getUmamiViews(): Promise<number | null> {
  const base = process.env.UMAMI_API_URL;      // 例如 http://127.0.0.1:3000
  const websiteId = process.env.UMAMI_WEBSITE_ID;
  const token = process.env.UMAMI_TOKEN;       // Umami 后台生成的 API Token
  if (!base || !websiteId || !token) return null;

  try {
    const end = Date.now();
    const start = end - 365 * 86400000;
    const res = await fetch(
      `${base}/api/websites/${websiteId}/stats?startAt=${start}&endAt=${end}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Umami v2 返回 { pageviews: 数字 }，v1 返回 { pageviews: { value } }
    const pv = data?.pageviews;
    const n = typeof pv === "number" ? pv : pv?.value;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

/** 站点统计（异步，以便读取 Umami） */
export async function getSiteStats(): Promise<Stat[]> {
  const db = getDb();
  const c = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  const posts = c("SELECT COUNT(*) c FROM posts WHERE type='post' AND status='published'");
  const shuo = c("SELECT COUNT(*) c FROM posts WHERE type='shuoshuo' AND status='published'");
  const comments = c("SELECT COUNT(*) c FROM comments WHERE status='approved'");

  const first = db.prepare(
    "SELECT MIN(published_at) m FROM posts WHERE type='post' AND status='published'"
  ).get() as { m: string | null };
  let days = 0;
  if (first?.m) {
    const start = new Date(first.m.replace(" ", "T")).getTime();
    if (!isNaN(start)) days = Math.max(1, Math.floor((Date.now() - start) / 86400000));
  }

  // 优先用 Umami 真实数据；未配置时显示 "—"
  const views = await getUmamiViews();
  const viewsText =
    views === null ? "—"
    : views >= 10000 ? (views / 10000).toFixed(1) + "w"
    : String(views);

  return [
    { label: "文章", value: String(posts), icon: "📝" },
    { label: "说说", value: String(shuo), icon: "💬" },
    { label: "评论", value: String(comments), icon: "🗨" },
    { label: "运行", value: days + "天", icon: "⏳" },
    { label: "访问", value: viewsText, icon: "👁" },
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

  const list = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = list[0]?.[1] || 1;
  return list.map(([name, count]) => ({ name, count, size: 0.72 + (count / max) * 0.28 }));
}
