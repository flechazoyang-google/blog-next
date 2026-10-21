import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStepUp, stepUpCodeFrom, handle, noStore } from "@/lib/guards";
import { startTotpSetup } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * 生成待确认的 TOTP 密钥（A7）。
 * 已启用时重新绑定属于敏感操作 -> 要求 step-up，防止会话劫持者换绑。
 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (ctx.user.totp_enabled) {
    await requireStepUp(ctx, stepUpCodeFrom(req, body));
  }

  const { secret, uri } = startTotpSetup(ctx.user.id);
  logAudit({
    action: "totp.start", userId: ctx.user.id, userName: ctx.user.username,
    meta: { rebind: !!ctx.user.totp_enabled }, ip: ctx.ip, userAgent: ctx.userAgent,
  });
  return noStore(NextResponse.json({ secret, uri }));
});
