import { NextRequest, NextResponse } from "next/server";
import { getUser, verifyTotp, consumeRecoveryCode, verifyPassword, setSessionCookie } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { DUMMY_HASH } from "@/lib/crypto";
import { consumeAll, reset } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { logAudit } from "@/lib/audit";
import { handle, noStore } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * 登录（方案 A3 / A5 / A7）。
 *
 * 与旧实现的三处关键差别：
 *   1) IP 取自 x-real-ip（nginx 的 $remote_addr，客户端无法伪造），
 *      而不是 x-forwarded-for 的首段（那是客户端自报的，换个头就绕过限流）
 *   2) 限流是**双维度**：同一账号 + 同一 IP 各自计数，
 *      否则换 IP 就能对同一账号无限爆破
 *   3) 用户不存在时也跑一次 bcrypt，抹平响应时间差，堵住用户名枚举
 */
export const POST = handle(async (req: NextRequest) => {
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const totp = (body.totp ?? "").trim();

  if (!username || !password) {
    return noStore(NextResponse.json({ error: "请填写账号密码" }, { status: 400 }));
  }

  // 双桶限流：账号维度防定向爆破，IP 维度防撞库
  const limit = consumeAll([
    { key: "login:acct:" + username.toLowerCase(), max: 10, windowSec: 3600 },
    { key: "login:ip:" + ip, max: 20, windowSec: 3600 },
  ]);
  if (!limit.ok) {
    logAudit({ action: "login.fail", userName: username, meta: { reason: "rate-limited", bucket: limit.blockedKey }, ip, userAgent: ua });
    return noStore(NextResponse.json(
      { error: "尝试次数过多，请 " + Math.ceil(limit.retryAfter / 60) + " 分钟后再试" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    ));
  }

  const user = getUser(username);
  if (!user) {
    // 仍然跑一次 bcrypt，避免「快 = 用户不存在」的时间侧信道
    await verifyPassword(password, DUMMY_HASH);
    logAudit({ action: "login.fail", userName: username, meta: { reason: "no-such-user" }, ip, userAgent: ua });
    return noStore(NextResponse.json({ error: "账号或密码错误" }, { status: 401 }));
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    logAudit({ action: "login.fail", userId: user.id, userName: user.username, meta: { reason: "bad-password" }, ip, userAgent: ua });
    return noStore(NextResponse.json({ error: "账号或密码错误" }, { status: 401 }));
  }

  // 第二步：TOTP 或恢复码
  if (user.totp_enabled && user.totp_secret) {
    if (!totp) {
      return noStore(NextResponse.json({ error: "请输入两步验证码", needTotp: true }, { status: 401 }));
    }
    const totpOk = verifyTotp(user.totp_secret, totp);
    const recoveryOk = !totpOk && consumeRecoveryCode(user.id, totp);
    if (!totpOk && !recoveryOk) {
      logAudit({ action: "login.fail", userId: user.id, userName: user.username, meta: { reason: "bad-totp" }, ip, userAgent: ua });
      return noStore(NextResponse.json({ error: "验证码错误", needTotp: true }, { status: 401 }));
    }
  }

  const { token } = createSession(user.id, { ip, userAgent: ua });
  await setSessionCookie(token);
  reset(["login:acct:" + username.toLowerCase()]);
  logAudit({ action: "login.ok", userId: user.id, userName: user.username, meta: { viaTotp: !!user.totp_enabled }, ip, userAgent: ua });

  return noStore(NextResponse.json({ ok: true }));
});
