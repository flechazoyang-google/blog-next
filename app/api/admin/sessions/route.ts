import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handle, noStore, badRequest } from "@/lib/guards";
import { listSessions, revokeAllSessions, revokeSessionByIdPrefix } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  return noStore(NextResponse.json({ sessions: listSessions(ctx.user.id, ctx.token) }));
});

/** 撤销指定会话或全部会话（A5：终于有"踢设备"的能力） */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "revoke_all") {
    const n = revokeAllSessions(ctx.user.id);
    logAudit({ action: "session.revoke_all", userId: ctx.user.id, userName: ctx.user.username, meta: { revoked: n }, ip: ctx.ip, userAgent: ctx.userAgent });
    const res = NextResponse.json({ ok: true, revoked: n });
    res.cookies.delete("blog_session");
    return noStore(res);
  }
  if (action === "revoke") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw badRequest("缺少会话 id");
    const n = revokeSessionByIdPrefix(ctx.user.id, id);
    logAudit({ action: "session.revoke", userId: ctx.user.id, userName: ctx.user.username, meta: { id, revoked: n }, ip: ctx.ip, userAgent: ctx.userAgent });
    return noStore(NextResponse.json({ ok: true, revoked: n }));
  }
  throw badRequest("未知操作");
});
