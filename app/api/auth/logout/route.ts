import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, destroySession, sessionUser } from "@/lib/session";
import { clientIp } from "@/lib/request-ip";
import { logAudit } from "@/lib/audit";
import { readToken, handle, noStore } from "@/lib/guards";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const token = await readToken();
  if (token) {
    const user = sessionUser(token);
    destroySession(token);
    if (user) {
      logAudit({
        action: "logout", userId: user.id, userName: user.username,
        ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? "",
      });
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return noStore(res);
});
