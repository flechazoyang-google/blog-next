import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStepUp, stepUpCodeFrom, handle, noStore } from "@/lib/guards";
import { disableTotp, clearTotpPending } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * 关闭两步验证（A5）。
 * 这是最危险的一个接口：原实现只判 currentUser()，
 * 于是任何拿到 Cookie 的人都能一键关掉 2FA 并把真管理员锁死。
 * 现在强制 step-up。
 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await requireStepUp(ctx, stepUpCodeFrom(req, body));

  disableTotp(ctx.user.id);
  clearTotpPending(ctx.user.id);
  logAudit({
    action: "totp.disable", userId: ctx.user.id, userName: ctx.user.username,
    ip: ctx.ip, userAgent: ctx.userAgent,
  });
  return noStore(NextResponse.json({ ok: true }));
});
