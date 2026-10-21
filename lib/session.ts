import { getDb } from "./db";
import { hashToken, randomToken } from "./crypto";
import { nowIso } from "./time";

export const COOKIE_NAME = "blog_session";
const SESSION_DAYS = 30;
/** 敏感操作要求的「新鲜认证」窗口 */
export const STEP_UP_SECONDS = 10 * 60;
/** 会话定期续期，避免活跃用户被硬性登出 */
const TOUCH_INTERVAL_SEC = 60 * 60;

export type SessionUser = {
  id: number;
  username: string;
  role: string;
  totp_enabled: number;
  totp_secret: string | null;
};

type SessionRow = {
  token_hash: string;
  user_id: number;
  expires_at: string;
  created_at: string;
  last_seen_at: string | null;
  auth_at: string | null;
  user_agent: string;
  ip: string;
};

/**
 * 建立会话。
 * 关键：返回给客户端的只有明文 token，**库里只落 SHA-256**。
 * 原先明文存主键，任何一次备份外流都等于交出全部会话。
 */
export function createSession(
  userId: number,
  meta: { ip?: string; userAgent?: string } = {}
): { token: string; expiresAt: string } {
  const db = getDb();
  const token = randomToken(32);
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at, user_agent, ip, auth_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    hashToken(token),
    userId,
    expiresAt,
    now,
    now,
    (meta.userAgent ?? "").slice(0, 300),
    (meta.ip ?? "").slice(0, 64),
    now
  );
  return { token, expiresAt };
}

export function findSession(token: string): SessionRow | null {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(row.token_hash);
    return null;
  }
  return row;
}

export function sessionUser(token: string): SessionUser | null {
  const row = findSession(token);
  if (!row) return null;
  const db = getDb();
  const user = db
    .prepare("SELECT id, username, role, totp_enabled, totp_secret FROM users WHERE id = ?")
    .get(row.user_id) as SessionUser | undefined;
  if (!user) return null;
  // 滑动续期：每小时最多写一次，避免每个请求都产生写入
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeen > TOUCH_INTERVAL_SEC * 1000) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(nowIso(), row.token_hash);
  }
  return user;
}

/** 本次会话是否在 step-up 窗口内（刚登录 / 刚验证过 TOTP） */
export function isFreshAuth(token: string, withinSec = STEP_UP_SECONDS): boolean {
  const row = findSession(token);
  if (!row?.auth_at) return false;
  return Date.now() - new Date(row.auth_at).getTime() <= withinSec * 1000;
}

/** 通过验证后刷新 step-up 时间戳 */
export function markFreshAuth(token: string): void {
  getDb().prepare("UPDATE sessions SET auth_at = ? WHERE token_hash = ?").run(nowIso(), hashToken(token));
}

export function destroySession(token: string): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function revokeAllSessions(userId: number): number {
  return getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId).changes;
}

export type SessionInfo = {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
};

export function listSessions(userId: number, currentToken: string): SessionInfo[] {
  const rows = getDb()
    .prepare("SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC")
    .all(userId, nowIso()) as SessionRow[];
  const currentHash = currentToken ? hashToken(currentToken) : "";
  return rows.map((r) => ({
    id: r.token_hash.slice(0, 12),
    userAgent: r.user_agent || "(未知设备)",
    ip: r.ip || "-",
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    expiresAt: r.expires_at,
    current: r.token_hash === currentHash,
  }));
}

/** 按短 id 前缀撤销（UI 只展示哈希前 12 位，不暴露完整 token） */
export function revokeSessionByIdPrefix(userId: number, prefix: string): number {
  if (!prefix || prefix.length < 8) return 0;
  const db = getDb();
  const rows = db.prepare("SELECT token_hash FROM sessions WHERE user_id = ?").all(userId) as { token_hash: string }[];
  const hit = rows.find((r) => r.token_hash.startsWith(prefix));
  if (!hit) return 0;
  return db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hit.token_hash).changes;
}

/** 清理过期会话（原先只在被访问时惰性删除，表会单调增长） */
export function pruneSessions(): number {
  return getDb().prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso()).changes;
}

export const SESSION_MAX_AGE = SESSION_DAYS * 86400;
