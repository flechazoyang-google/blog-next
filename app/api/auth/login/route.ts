import { NextRequest, NextResponse } from "next/server";
import { getUser, verifyPassword, verifyTotp, createSession, rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`login:${ip}`, 5, 900)) {
    return NextResponse.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });
  }

  const { username, password, totp } = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (!username || !password) return NextResponse.json({ error: "请填写账号密码" }, { status: 400 });

  const user = getUser(username);
  if (!user) return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });

  if (user.totp_enabled && user.totp_secret) {
    if (!totp) return NextResponse.json({ error: "请输入两步验证码", needTotp: true }, { status: 401 });
    if (!verifyTotp(user.totp_secret, totp)) {
      return NextResponse.json({ error: "验证码错误", needTotp: true }, { status: 401 });
    }
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
