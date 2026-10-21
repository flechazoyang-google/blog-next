import { NextRequest, NextResponse } from "next/server";
import { currentUser, verifyTotp } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { secret, code } = await req.json().catch(() => ({}));
  if (!secret || !code) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  if (!verifyTotp(secret, String(code))) {
    return NextResponse.json({ error: "验证码不对，请重试" }, { status: 400 });
  }
  getDb().prepare("UPDATE users SET totp_secret=?, totp_enabled=1 WHERE id=?").run(secret, user.id);
  return NextResponse.json({ ok: true });
}
