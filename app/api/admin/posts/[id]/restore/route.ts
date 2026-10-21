import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin, requireStepUp, stepUpCodeFrom, handle, noStore, badRequest, notFound } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { nowIso } from "@/lib/time";
import { TAGS, REVALIDATE_PROFILE } from "@/lib/posts";

export const dynamic = "force-dynamic";

/** 从回收站恢复 */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAdmin(req);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("文章 id 不合法");

  const info = getDb().prepare("UPDATE posts SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL")
    .run(nowIso(), id);
  if (info.changes === 0) throw notFound("回收站里没有这篇文章");

  logAudit({ action: "post.restore", userId: ctx.user.id, userName: ctx.user.username, targetType: "post", targetId: id, ip: ctx.ip, userAgent: ctx.userAgent });
  revalidateTag(TAGS.posts, REVALIDATE_PROFILE);
  revalidateTag(TAGS.post(id), REVALIDATE_PROFILE);
  return noStore(NextResponse.json({ ok: true }));
});

/** 彻底删除（不可恢复）：要求 step-up，且明确告知会连带删除评论 */
export const DELETE = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAdmin(req);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("文章 id 不合法");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await requireStepUp(ctx, stepUpCodeFrom(req, body));

  const db = getDb();
  const row = db.prepare("SELECT id, deleted_at FROM posts WHERE id = ?").get(id) as { id: number; deleted_at: string | null } | undefined;
  if (!row) throw notFound("文章不存在");
  if (!row.deleted_at) throw badRequest("请先移入回收站，再彻底删除");

  const comments = (db.prepare("SELECT COUNT(*) c FROM comments WHERE post_id = ?").get(id) as { c: number }).c;
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);

  logAudit({
    action: "post.purge", userId: ctx.user.id, userName: ctx.user.username,
    targetType: "post", targetId: id, meta: { cascadeComments: comments }, ip: ctx.ip, userAgent: ctx.userAgent,
  });
  revalidateTag(TAGS.posts, REVALIDATE_PROFILE);
  revalidateTag(TAGS.post(id), REVALIDATE_PROFILE);
  return noStore(NextResponse.json({ ok: true, purgedComments: comments }));
});
