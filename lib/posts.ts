import { getDb, type Post } from "./db";

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

/** Next.js 传入的 params 是未解码的百分号编码，这里统一解码 */
export function decodeSlug(slug: string): string {
  try { return decodeURIComponent(slug); } catch { return slug; }
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
  const prev = db.prepare(
    "SELECT * FROM posts WHERE type='post' AND status='published' AND published_at < ? ORDER BY published_at DESC LIMIT 1"
  ).get(publishedAt) as Post | undefined;
  const next = db.prepare(
    "SELECT * FROM posts WHERE type='post' AND status='published' AND published_at > ? ORDER BY published_at ASC LIMIT 1"
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

export function makeExcerpt(md: string, len = 120): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > len ? plain.slice(0, len) + "…" : plain;
}
