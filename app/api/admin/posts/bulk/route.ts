import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin, requireStepUp, stepUpCodeFrom, handle, noStore, badRequest } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { nowIso } from "@/lib/time";
import { TAGS, REVALIDATE_PROFILE } from "@/lib/posts";

export const dynamic = "force-dynamic";

/**
 * 批量操作（P3-4）。
 * 删除类操作一律要求 step-up —— 批量误删的破坏面比单条大得多。
 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { ids?: unknown; action?: unknown; totp?: unknown } | null;
  if (!body) throw badRequest("参数错误");

  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length) throw badRequest("请先选择文章");
  if (ids.length > 200) throw badRequest("一次最多操作 200 篇");

  const action = String(body.action ?? "");
  const db = getDb();
  const ph = ids.map(() => "?").join(",");

  if (action === "delete") {
    await requireStepUp(ctx, stepUpCodeFrom(req, body as Record<string, unknown>));
    const info = db.prepare("UPDATE posts SET deleted_at = ?, updated_at = ? WHERE id IN (" + ph + ") AND deleted_at IS NULL")
      .run(nowIso(), nowIso(), ...ids);
    logAudit({ action: "post.bulk", userId: ctx.user.id, userName: ctx.user.username, meta: { action, ids, affected: info.changes }, ip: ctx.ip, userAgent: ctx.userAgent });
    revalidateTag(TAGS.posts, REVALIDATE_PROFILE);
    return noStore(NextResponse.json({ ok: true, affected: info.changes }));
  }

  if (action === "restore") {
    const info = db.prepare("UPDATE posts SET deleted_at = NULL, updated_at = ? WHERE id IN (" + ph + ") AND deleted_at IS NOT NULL")
      .run(nowIso(), ...ids);
    logAudit({ action: "post.bulk", userId: ctx.user.id, userName: ctx.user.username, meta: { action, ids, affected: info.changes }, ip: ctx.ip, userAgent: ctx.userAgent });
    revalidateTag(TAGS.posts, REVALIDATE_PROFILE);
    return noStore(NextResponse.json({ ok: true, affected: info.changes }));
  }

  if (action === "publish" || action === "unpublish") {
    const publish = action === "publish";
    const info = publish
      ? db.prepare("UPDATE posts SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id IN (" + ph + ")")
          .run(nowIso(), nowIso(), ...ids)
      : db.prepare("UPDATE posts SET status = 'draft', updated_at = ? WHERE id IN (" + ph + ")")
          .run(nowIso(), ...ids);
    logAudit({ action: "post.bulk", userId: ctx.user.id, userName: ctx.user.username, meta: { action, ids, affected: info.changes }, ip: ctx.ip, userAgent: ctx.userAgent });
    revalidateTag(TAGS.posts, REVALIDATE_PROFILE);
    return noStore(NextResponse.json({ ok: true, affected: info.changes }));
  }

  throw badRequest("未知的批量操作");
});
