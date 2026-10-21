import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handle, noStore } from "@/lib/guards";
import { clearTotpPending } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 放弃本次绑定（清掉服务端暂存的 pending 密钥，不影响已启用的 2FA） */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  clearTotpPending(ctx.user.id);
  return noStore(NextResponse.json({ ok: true }));
});
