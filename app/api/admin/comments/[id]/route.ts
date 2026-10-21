import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin, handle, noStore, badRequest, notFound } from "@/lib/guards";
import { logAudit, type AuditAction } from "@/lib/audit";
import { TAGS, REVALIDATE_PROFILE } from "@/lib/posts";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, { status?: "approved" | "spam"; action: AuditAction }> = {
  approve: { status: "approved", action: "comment.approve" },
  spam: { status: "spam", action: "comment.spam" },
};

/**
 * 评论审核。
 * 修掉的问题：原实现对不存在的 id 静默返回 {ok:true}（Number("abc") = NaN -> 匹配 0 行）。
 * 现在校验 id、检查 changes、写审计。
 */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAdmin(req);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("评论 id 不合法");

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const db = getDb();
  const exists = db.prepare("SELECT id FROM comments WHERE id = ?").get(id);
  if (!exists) throw notFound("评论不存在");

  if (action === "delete") {
    const info = db.prepare("DELETE FROM comments WHERE id = ?").run(id);
    if (info.changes === 0) throw notFound("评论不存在");
    logAudit({ action: "comment.delete", userId: ctx.user.id, userName: ctx.user.username, targetType: "comment", targetId: id, ip: ctx.ip, userAgent: ctx.userAgent });
    revalidateTag(TAGS.comments, REVALIDATE_PROFILE);
    return noStore(NextResponse.json({ ok: true }));
  }

  const mapped = ACTIONS[action];
  if (!mapped) throw badRequest("未知操作");
  const info = db.prepare("UPDATE comments SET status = ? WHERE id = ?").run(mapped.status!, id);
  if (info.changes === 0) throw notFound("评论不存在");

  logAudit({ action: mapped.action, userId: ctx.user.id, userName: ctx.user.username, targetType: "comment", targetId: id, ip: ctx.ip, userAgent: ctx.userAgent });
  revalidateTag(TAGS.comments, REVALIDATE_PROFILE);
  return noStore(NextResponse.json({ ok: true, status: mapped.status }));
});
