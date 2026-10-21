import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { makeExcerpt } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = getDb().prepare(
    "SELECT id,type,title,slug,status,type,categories,tags,published_at,updated_at FROM posts ORDER BY COALESCE(published_at,updated_at) DESC"
  ).all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const type = b.type || "post";
  const title = (b.title || "").trim();
  const content = b.content || "";
  let slug = (b.slug || "").trim();
  if (!slug) slug = slugify(title || "untitled");

  // slug 冲突时自动加序号
  const db = getDb();
  let finalSlug = slug, n = 2;
  while (db.prepare("SELECT 1 FROM posts WHERE type=? AND slug=?").get(type, finalSlug)) {
    finalSlug = `${slug}-${n++}`;
  }

  const status = b.status === "published" ? "published" : "draft";
  const publishedAt = status === "published"
    ? (b.published_at || new Date().toISOString().replace("T", " ").slice(0, 19))
    : null;

  const info = db.prepare(
    `INSERT INTO posts (type,title,slug,content,excerpt,status,categories,tags,cover,published_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    type, title, finalSlug, content, makeExcerpt(content, 160), status,
    JSON.stringify(b.categories || []), JSON.stringify(b.tags || []),
    b.cover || null, publishedAt
  );

  return NextResponse.json({ ok: true, id: info.lastInsertRowid, slug: finalSlug });
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}
