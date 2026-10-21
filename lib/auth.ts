import { getDb } from "./db";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { cookies } from "next/headers";
import { DUMMY_HASH, generateRecoveryCode, normalizeRecoveryCode, hashToken as hashRecovery } from "./crypto";
import {
  COOKIE_NAME, SESSION_MAX_AGE, sessionUser, createSession, destroySession,
  findSession, isFreshAuth, markFreshAuth, type SessionUser,
} from "./session";

export { COOKIE_NAME, SESSION_MAX_AGE };
export type UserRow = {
  id: number; username: string; password_hash: string;
  totp_secret: string | null; totp_enabled: number;
  totp_pending: string | null; totp_pending_at: string | null;
  role: string;
};

const TOTP_PENDING_TTL_MS = 15 * 60 * 1000;

export function getUser(username: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/* ---------------------------------- TOTP ---------------------------------- */

export function createTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, account: string, issuer = "blog.yghsite.cn"): string {
  return new OTPAuth.TOTP({ issuer, label: account, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).toString();
}

/** 校验验证码，允许 ±1 个时间窗（时钟漂移） */
export function verifyTotp(secret: string, code: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({ issuer: "blog", label: "admin", algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
    return totp.validate({ token: String(code).replace(/\s/g, ""), window: 1 }) !== null;
  } catch {
    return false;
  }
}

/**
 * 第一步：生成待确认密钥，**只存服务端**（A7）。
 * 原实现让 confirm 用客户端回传的 secret 校验，等于绑定流程可被绕过。
 */
export function startTotpSetup(userId: number): { secret: string; uri: string } {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) throw new Error("user not found");
  const secret = createTotpSecret();
  db.prepare("UPDATE users SET totp_pending = ?, totp_pending_at = ? WHERE id = ?")
    .run(secret, new Date().toISOString(), userId);
  return { secret, uri: totpUri(secret, user.username) };
}

/** 第二步：只信任服务端暂存值；过期即作废 */
export function confirmTotpSetup(userId: number, code: string): boolean {
  const db = getDb();
  const user = getUserById(userId);
  if (!user?.totp_pending) return false;
  const at = user.totp_pending_at ? new Date(user.totp_pending_at).getTime() : 0;
  if (Date.now() - at > TOTP_PENDING_TTL_MS) {
    db.prepare("UPDATE users SET totp_pending = NULL, totp_pending_at = NULL WHERE id = ?").run(userId);
    return false;
  }
  if (!verifyTotp(user.totp_pending, code)) return false;
  db.prepare(
    "UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_pending = NULL, totp_pending_at = NULL WHERE id = ?"
  ).run(user.totp_pending, userId);
  return true;
}

export function disableTotp(userId: number): void {
  getDb().prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_pending = NULL WHERE id = ?").run(userId);
}

export function clearTotpPending(userId: number): void {
  getDb().prepare("UPDATE users SET totp_pending = NULL, totp_pending_at = NULL WHERE id = ?").run(userId);
}

/* ------------------------------ 恢复码（防锁死） ------------------------------ */

/** 生成 8 个一次性恢复码，返回**明文**（只展示一次），库里存哈希 */
export function regenerateRecoveryCodes(userId: number): string[] {
  const db = getDb();
  const codes = Array.from({ length: 8 }, () => generateRecoveryCode());
  db.transaction(() => {
    db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId);
    const ins = db.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)");
    for (const c of codes) ins.run(userId, hashRecovery(normalizeRecoveryCode(c)));
  })();
  return codes;
}

export function remainingRecoveryCodes(userId: number): number {
  return (getDb().prepare("SELECT COUNT(*) c FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").get(userId) as { c: number }).c;
}

/** 消费一个恢复码；成功返回 true 并标记已用 */
export function consumeRecoveryCode(userId: number, input: string): boolean {
  const db = getDb();
  const hash = hashRecovery(normalizeRecoveryCode(input));
  const row = db.prepare("SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL").get(userId, hash) as { id: number } | undefined;
  if (!row) return false;
  db.prepare("UPDATE recovery_codes SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return true;
}

/* --------------------------------- 密码 --------------------------------- */

export async function changePassword(userId: number, newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  getDb().prepare("UPDATE users SET password_hash = ?, password_updated_at = ? WHERE id = ?")
    .run(hash, new Date().toISOString(), userId);
}

/* ------------------------------ Cookie / 会话 ------------------------------ */

function cookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, cookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** 读当前请求的明文 token（只用于本进程内比较，不落库） */
export async function currentToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

/** 当前登录用户；null = 未登录 */
export async function currentUser(): Promise<SessionUser | null> {
  const token = await currentToken();
  if (!token) return null;
  return sessionUser(token);
}

export async function login(
  username: string, password: string, opts: { ip?: string; userAgent?: string } = {}
): Promise<{ ok: true; token: string } | { ok: false; needTotp?: boolean; error: string }> {
  const user = getUser(username);
  if (!user) {
    // 用户不存在也跑一次 bcrypt，抹平时间差（避免用户名枚举）
    await verifyPassword(password, DUMMY_HASH);
    return { ok: false, error: "账号或密码错误" };
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { ok: false, error: "账号或密码错误" };
  const { token } = createSession(user.id, opts);
  return { ok: true, token };
}

export async function logout(): Promise<void> {
  const token = await currentToken();
  if (token) destroySession(token);
  await clearSessionCookie();
}

export { isFreshAuth, markFreshAuth, findSession };
