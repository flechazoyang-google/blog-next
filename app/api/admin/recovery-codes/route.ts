import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStepUp, stepUpCodeFrom, handle, noStore } from "@/lib/guards";
import { regenerateRecoveryCodes, remainingRecoveryCodes } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  return noStore(NextResponse.json({ remaining: remainingRecoveryCodes(ctx.user.id) }));
});

/** 重新生成恢复码：旧码全部作废，属敏感操作 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await requireStepUp(ctx, stepUpCodeFrom(req, body));
  const codes = regenerateRecoveryCodes(ctx.user.id);
  logAudit({ action: "recovery.regenerate", userId: ctx.user.id, userName: ctx.user.username, ip: ctx.ip, userAgent: ctx.userAgent });
  return noStore(NextResponse.json({ ok: true, codes }));
});
