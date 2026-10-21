import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handle, noStore, badRequest } from "@/lib/guards";
import { confirmTotpSetup, regenerateRecoveryCodes } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * 确认绑定（A7）。
 * 关键修正：只校验**服务端暂存**的 totp_pending，拒绝客户端回传的 secret。
 * 原先 verifyTotp(secret, code) 用的是请求体里的 secret，等于绑定流程可绕过。
 *
 * 首次启用时同时下发恢复码（防止验证器丢失即永久锁死后台）。
 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code : typeof body.totp === "string" ? body.totp : "";
  if (!code.trim()) throw badRequest("请输入 6 位验证码");

  const ok = confirmTotpSetup(ctx.user.id, code);
  if (!ok) {
    return noStore(NextResponse.json({ error: "验证码不正确，或绑定已超时（15 分钟）" }, { status: 400 }));
  }

  const recoveryCodes = regenerateRecoveryCodes(ctx.user.id);
  logAudit({
    action: "totp.enable", userId: ctx.user.id, userName: ctx.user.username,
    ip: ctx.ip, userAgent: ctx.userAgent,
  });
  return noStore(NextResponse.json({ ok: true, recoveryCodes }));
});
