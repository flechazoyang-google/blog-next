import { getDb } from "./db";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { cookies } from "next/headers";

const COOKIE = "blog_session";
const SESSION_DAYS = 30;

export type UserRow = {
  id: number; username: string; password_hash: string;
  totp_secret: string | null; totp_enabled: number;
};

export function getUser(username: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE username=?").get(username) as UserRow | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id=?").get(id) as UserRow | undefined;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/** 校验 TOTP 验证码（允许 ±1 个时间窗） */
export function verifyTotp(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: "blog",
    label: "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null;
}

export function createTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, account: string): string {
  return new OTPAuth.TOTP({
    issuer: "blog.yghsite.cn",
    label: account,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).toString();
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  getDb().prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)").run(token, userId, exp);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_DAYS * 86400,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token=?").run(token);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<UserRow | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const row = getDb().prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token=?"
  ).get(token) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    getDb().prepare("DELETE FROM sessions WHERE token=?").run(token);
    return null;
  }
  return getUserById(row.user_id) ?? null;
}

/** 简单限流：同一 key 在 windowSec 内最多 max 次 */
export function rateLimit(key: string, max: number, windowSec: number): boolean {
  const db = getDb();
  const now = Date.now();
  const row = db.prepare("SELECT count, reset_at FROM rate_limits WHERE key=?").get(key) as
    { count: number; reset_at: string } | undefined;
  if (!row || new Date(row.reset_at).getTime() < now) {
    const reset = new Date(now + windowSec * 1000).toISOString();
    db.prepare("INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,reset_at=excluded.reset_at").run(key, reset);
    return true;
  }
  if (row.count >= max) return false;
  db.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").run(key);
  return true;
}
