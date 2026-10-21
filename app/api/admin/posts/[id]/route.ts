import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin, requireStepUp, stepUpCodeFrom, handle, noStore, badRequest, notFound, conflict } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { oneOf, slug as vSlug, str, strList, unwrap } from "@/lib/validate";
import { nowIso } from "@/lib/time";
import { makeExcerpt, TAGS } from "@/lib/posts";
import { invalidate } from "@/lib/purge";

export const dynamic = "force-dynamic";

const TYPES = ["post", "page", "shuoshuo"] as const;
const STATUSES = ["draft", "published"] as const;

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("文章 id 不合法");
  return n;
}

export const GET = handle(async (req: NextRequest, { params }: Params) => {
  await requireAdmin(req);
  const id = parseId((await params).id);
  const row = getDb().prepare("SELECT * FROM posts WHERE id = ?").get(id);
  if (!row) throw notFound("文章不存在");
  return noStore(NextResponse.json(row));
});

/**
 * 更新。修掉：
 *   - 对不存在的 id 返回 404（原实现从不检查 changes，假装成功）
 *   - slug 冲突返回 409，旧 slug 记入 post_aliases 以便 301（B8）
 *   - categories/tags 用安全解析，脏 JSON 不再 500（B6）
 *   - 时间统一 UTC ISO（B1/B2）
 */
export const PATCH = handle(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAdmin(req);
  const id = parseId((await params).id);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw badRequest("参数错误");

  const db = getDb();
  const existing = db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as
    | { id: number; type: string; slug: string; title: string; content: string; status: string; published_at: string | null }
    | undefined;
  if (!existing) throw notFound("文章不存在");

  const title = unwrap(str(body.title ?? existing.title, { field: "标题", max: 200 }));
  const content = unwrap(str(body.content ?? existing.content, { field: "正文", max: 500000 }));
  const status = unwrap(oneOf(body.status, STATUSES, { field: "状态", fallback: existing.status as "draft" | "published" }));
  const type = unwrap(oneOf(body.type, TYPES, { field: "类型", fallback: existing.type as "post" }));
  const categories = unwrap(strList(body.categories, { field: "分类" }));
  const tags = unwrap(strList(body.tags, { field: "标签" }));
  const wantedSlug = unwrap(vSlug(body.slug, { field: "URL 路径" })) || existing.slug;

  let slug = existing.slug;
  if (wantedSlug !== existing.slug) {
    const clash = db.prepare("SELECT 1 FROM posts WHERE type = ? AND slug = ? AND id != ?").get(type, wantedSlug, id);
    if (clash) throw conflict("该 URL 路径已被其他文章占用");
    const aliasClash = db.prepare("SELECT post_id FROM post_aliases WHERE slug = ?").get(wantedSlug) as { post_id: number } | undefined;
    if (aliasClash && aliasClash.post_id !== id) throw conflict("该 URL 路径已被历史别名占用");
    db.prepare("INSERT INTO post_aliases (slug, post_id) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET post_id = excluded.post_id")
      .run(existing.slug, id);
    slug = wantedSlug;
  }

  const becomingPublished = status === "published" && existing.status !== "published";
  const publishedAt = existing.published_at ?? (status === "published" ? nowIso() : null);

  // comments_enabled：允许单独给某一篇/某一页关掉评论
  const commentsEnabled =
    typeof body.comments_enabled === "boolean"
      ? (body.comments_enabled ? 1 : 0)
      : ((db.prepare("SELECT comments_enabled FROM posts WHERE id = ?").get(id) as { comments_enabled: number } | undefined)?.comments_enabled ?? 1);

  const info = db.prepare(
    "UPDATE posts SET type = ?, title = ?, slug = ?, content = ?, excerpt = ?, status = ?, categories = ?, tags = ?, " +
    "cover = COALESCE(?, cover), published_at = ?, updated_at = ?, comments_enabled = ? WHERE id = ?"
  ).run(
    type, title, slug, content, makeExcerpt(content, 160), status,
    JSON.stringify(categories), JSON.stringify(tags),
    typeof body.cover === "string" && body.cover ? body.cover : null,
    becomingPublished ? (publishedAt ?? nowIso()) : publishedAt,
    nowIso(), commentsEnabled, id
  );
  if (info.changes === 0) throw notFound("文章不存在");

  logAudit({
    action: becomingPublished ? "post.publish" : status === "draft" && existing.status === "published" ? "post.unpublish" : "post.update",
    userId: ctx.user.id, userName: ctx.user.username,
    targetType: "post", targetId: id,
    meta: { slug, status, slugChanged: slug !== existing.slug },
    ip: ctx.ip, userAgent: ctx.userAgent,
  });
  invalidate([TAGS.posts, TAGS.post(id)]);

  return noStore(NextResponse.json({ ok: true, slug, status }));
});

/** 删除 = 软删除进回收站（P3-4）；原实现硬删且级联永久删评论 */
export const DELETE = handle(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAdmin(req);
  const id = parseId((await params).id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await requireStepUp(ctx, stepUpCodeFrom(req, body));

  const db = getDb();
  const info = db.prepare("UPDATE posts SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(nowIso(), nowIso(), id);
  if (info.changes === 0) throw notFound("文章不存在或已在回收站");

  logAudit({ action: "post.delete", userId: ctx.user.id, userName: ctx.user.username, targetType: "post", targetId: id, ip: ctx.ip, userAgent: ctx.userAgent });
  invalidate([TAGS.posts, TAGS.post(id)]);
  return noStore(NextResponse.json({ ok: true, movedToTrash: true }));
});
