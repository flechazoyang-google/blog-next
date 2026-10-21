import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { makeExcerpt } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = getDb().prepare("SELECT * FROM posts WHERE id=?").get(Number(id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const db = getDb();
  const existing = db.prepare("SELECT * FROM posts WHERE id=?").get(Number(id)) as any;
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const status = b.status === "published" ? "published" : b.status === "draft" ? "draft" : existing.status;
  let publishedAt = existing.published_at;
  if (status === "published" && !publishedAt) {
    publishedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  }

  const content = b.content ?? existing.content;
  db.prepare(
    `UPDATE posts SET title=?, slug=?, content=?, excerpt=?, status=?, categories=?, tags=?, published_at=?,
      updated_at=datetime('now') WHERE id=?`
  ).run(
    b.title ?? existing.title,
    b.slug ?? existing.slug,
    content,
    b.excerpt ?? makeExcerpt(content, 160),
    status,
    JSON.stringify(b.categories ?? JSON.parse(existing.categories)),
    JSON.stringify(b.tags ?? JSON.parse(existing.tags)),
    publishedAt,
    Number(id)
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  getDb().prepare("DELETE FROM posts WHERE id=?").run(Number(id));
  return NextResponse.json({ ok: true });
}
