import { getDb, ftsAvailable } from "./db";
import { makeExcerpt } from "./posts";
import { dateKeyIn } from "./time";

export type SearchHit = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  categories: string[];
};

/** trigram 分词的最短查询长度：少于 3 个字符无法匹配（实测结论） */
export const TRIGRAM_MIN = 3;

/**
 * 把用户输入变成安全的 FTS5 查询串。
 *
 * 做法：整体包成短语（"..."），并把内部的 " 换成 ""（FTS5 的转义），
 * 这样就无需关心里面的 AND/OR/NOT/NEAR 等语法字符被当成运算符。
 */
export function toFtsQuery(raw: string): string {
  const q = raw.trim().replace(/\s+/g, " ");
  if (!q) return "";
  return '"' + q.replace(/"/g, '""') + '"';
}

function likeSearch(q: string, limit: number): SearchHit[] {
  const db = getDb();
  // LIKE 走不上索引，但只在 1~2 字查询与 FTS 失败时使用，量级可接受
  const like = "%" + q.replace(/[%_\\]/g, "") + "%";
  const rows = db.prepare(
    "SELECT id, title, slug, content, categories, published_at, created_at FROM posts " +
    "WHERE type = 'post' AND status = 'published' AND deleted_at IS NULL " +
    "  AND (title LIKE ? OR content LIKE ?) " +
    "ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?"
  ).all(like, like, limit) as {
    id: number; title: string; slug: string; content: string;
    categories: string; published_at: string | null; created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    excerpt: makeExcerpt(r.content, 90),
    date: dateKeyIn(r.published_at || r.created_at),
    categories: safeCats(r.categories),
  }));
}

function safeCats(s: string): string[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * 搜索（方案 C10）。
 *
 * 混合策略：FTS5(trigram) 负责 >=3 字符的查询；不足 3 字符或 FTS 不可用时退回 LIKE。
 * 这样既避免了 LIKE 全表扫的常态开销，又保住了「变换」这类二字中文的可用性。
 * 返回值只含摘要，不再把整篇正文回传给前端（原实现单篇最大 13,871 B）。
 */
export function searchPosts(raw: string, opts: { limit?: number } = {}): { hits: SearchHit[]; mode: "fts" | "like" } {
  const q = raw.trim();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  if (!q) return { hits: [], mode: "like" };

  const db = getDb();
  const useFts = ftsAvailable() && [...q].length >= TRIGRAM_MIN;

  if (useFts) {
    try {
      const rows = db.prepare(
        "SELECT p.id, p.title, p.slug, p.content, p.categories, p.published_at, p.created_at " +
        "FROM posts_fts f JOIN posts p ON p.id = f.rowid " +
        "WHERE posts_fts MATCH ? AND p.type = 'post' AND p.status = 'published' AND p.deleted_at IS NULL " +
        "ORDER BY bm25(posts_fts) LIMIT ?"
      ).all(toFtsQuery(q), limit) as {
        id: number; title: string; slug: string; content: string;
        categories: string; published_at: string | null; created_at: string;
      }[];

      if (rows.length) {
        return {
          mode: "fts",
          hits: rows.map((r) => ({
            id: r.id,
            title: r.title,
            slug: r.slug,
            excerpt: makeExcerpt(r.content, 90),
            date: dateKeyIn(r.published_at || r.created_at),
            categories: safeCats(r.categories),
          })),
        };
      }
      // FTS 无结果时仍走一次 LIKE：trigram 对含标点/空格的短语可能过严
      return { hits: likeSearch(q, limit), mode: "like" };
    } catch (e) {
      console.warn("[search] FTS failed, falling back to LIKE:", (e as Error).message);
      return { hits: likeSearch(q, limit), mode: "like" };
    }
  }

  return { hits: likeSearch(q, limit), mode: "like" };
}

/** 重建索引（媒体/迁移后可用；后台"维护"里可触发） */
export function rebuildSearchIndex(): void {
  const db = getDb();
  if (!ftsAvailable()) return;
  db.prepare("INSERT INTO posts_fts (posts_fts) VALUES ('rebuild')").run();
}

export function searchIndexRows(): number {
  if (!ftsAvailable()) return 0;
  return (getDb().prepare("SELECT COUNT(*) c FROM posts_fts").get() as { c: number }).c;
}
