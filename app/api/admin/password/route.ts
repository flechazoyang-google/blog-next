import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStepUp, stepUpCodeFrom, handle, noStore, badRequest } from "@/lib/guards";
import { changePassword, verifyPassword, getUserById } from "@/lib/auth";
import { revokeAllSessions } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** 改密码：要求旧密码 + step-up；成功后踢掉所有会话 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 12) throw badRequest("新密码至少 12 位");
  if (newPassword.length > 200) throw badRequest("新密码过长");

  const user = getUserById(ctx.user.id);
  if (!user) throw badRequest("用户不存在");
  if (!(await verifyPassword(oldPassword, user.password_hash))) throw badRequest("当前密码不正确");

  await requireStepUp(ctx, stepUpCodeFrom(req, body));
  await changePassword(ctx.user.id, newPassword);

  const revoked = revokeAllSessions(ctx.user.id);
  logAudit({
    action: "password.change", userId: ctx.user.id, userName: ctx.user.username,
    meta: { revokedSessions: revoked }, ip: ctx.ip, userAgent: ctx.userAgent,
  });

  const res = NextResponse.json({ ok: true, revokedSessions: revoked });
  res.cookies.delete("blog_session");
  return noStore(res);
});
