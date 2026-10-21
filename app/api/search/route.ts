import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { makeExcerpt } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json([]);

  const db = getDb();
  const like = "%" + q.replace(/[%_]/g, "") + "%";
  const rows = db.prepare(
    `SELECT id, title, slug, content, published_at, categories
     FROM posts
     WHERE type='post' AND status='published'
       AND (title LIKE ? OR content LIKE ?)
     ORDER BY published_at DESC
     LIMIT 20`
  ).all(like, like) as any[];

  return NextResponse.json(
    rows.map((r) => ({
      title: r.title,
      slug: r.slug,
      excerpt: makeExcerpt(r.content, 90),
      date: (r.published_at || "").slice(0, 10),
    }))
  );
}
