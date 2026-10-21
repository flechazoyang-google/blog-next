import { getDb, type Post } from "./db";

/** Next.js 传入的 params 是未解码的百分号编码，这里统一解码 */
export function decodeSlug(slug: string): string {
  try { return decodeURIComponent(slug); } catch { return slug; }
}

export function listPosts(opts: { limit?: number; offset?: number } = {}): Post[] {
  const db = getDb();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  return db.prepare(
    "SELECT * FROM posts WHERE type='post' AND status='published' ORDER BY published_at DESC LIMIT ? OFFSET ?"
  ).all(limit, offset) as Post[];
}

export function countPosts(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) c FROM posts WHERE type='post' AND status='published'").get() as { c: number }).c;
}

export function getPostBySlug(rawSlug: string): Post | undefined {
  const db = getDb();
  const slug = decodeSlug(rawSlug);
  return db.prepare("SELECT * FROM posts WHERE type='post' AND slug=? AND status='published'").get(slug) as Post | undefined;
}

export function getPageBySlug(rawSlug: string): Post | undefined {
  const db = getDb();
  const slug = decodeSlug(rawSlug);
  return db.prepare("SELECT * FROM posts WHERE type='page' AND slug=?").get(slug) as Post | undefined;
}

export function listShuoshuo(limit = 50): Post[] {
  const db = getDb();
  return db.prepare("SELECT * FROM posts WHERE type='shuoshuo' AND status='published' ORDER BY published_at DESC LIMIT ?").all(limit) as Post[];
}

export function listArchives(): { ym: string; posts: Post[] }[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM posts WHERE type='post' AND status='published' ORDER BY published_at DESC"
  ).all() as Post[];
  const groups = new Map<string, Post[]>();
  for (const r of rows) {
    const ym = (r.published_at || "").slice(0, 4);
    if (!groups.has(ym)) groups.set(ym, []);
    groups.get(ym)!.push(r);
  }
  return [...groups.entries()].map(([ym, posts]) => ({ ym, posts }));
}

export function prevNextPost(publishedAt: string): { prev?: Post; next?: Post } {
  const db = getDb();
  // 列表按时间倒序（最新在前），因此：
  //   上一篇 = 列表里更靠上的一条 = 时间【更晚】的
  //   下一篇 = 列表里更靠下的一条 = 时间【更早】的
  const prev = db.prepare(
    "SELECT * FROM posts WHERE type='post' AND status='published' AND published_at > ? ORDER BY published_at ASC LIMIT 1"
  ).get(publishedAt) as Post | undefined;
  const next = db.prepare(
    "SELECT * FROM posts WHERE type='post' AND status='published' AND published_at < ? ORDER BY published_at DESC LIMIT 1"
  ).get(publishedAt) as Post | undefined;
  return { prev, next };
}

export function parseJsonArray(s: string): string[] {
  try { return JSON.parse(s || "[]"); } catch { return []; }
}

export function readingTime(md: string): number {
  const chars = md.replace(/\s/g, "").length;
  return Math.max(1, Math.round(chars / 400));
}

/**
 * 生成摘要。关键：链接/图片只保留可读文字，绝不能把 URL 混进摘要。
 */
export function makeExcerpt(md: string, len = 120): string {
  let t = md;
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/<[^>]+>/g, " ");
  // 整段表格删掉（摘要是给人读的，表格碎片没有意义）
  t = t.replace(/^\s*\|.*\|\s*$/gm, " ");
  t = t.replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, " ");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/[*_~`>\-]/g, "");
  // 裸 URL（包括被括号包裹的）一律去掉
  t = t.replace(/\(?\s*https?:\/\/[^\s)]+\s*\)?/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t.length > len ? t.slice(0, len) + "…" : t;
}
