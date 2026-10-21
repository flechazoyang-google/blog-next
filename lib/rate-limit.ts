import { getDb } from "./db";
import { nowIso } from "./time";

export type LimitResult = { ok: boolean; retryAfter: number };

/**
 * 固定窗口限流（SQLite 持久化，重启不丢）。
 *
 * 与旧实现的两点差别：
 *   1) key 由调用方保证带**真实** IP（见 lib/request-ip.ts），不再从可伪造的 XFF 首段取；
 *   2) 改为「读-写同一事务」，并发下不会双花（原实现读后写，竞态可绕过）。
 */
export function consume(key: string, max: number, windowSec: number): LimitResult {
  const db = getDb();
  const now = Date.now();
  return db.transaction((): LimitResult => {
    const row = db.prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?").get(key) as
      | { count: number; reset_at: string }
      | undefined;
    const resetMs = row ? new Date(row.reset_at).getTime() : 0;
    if (!row || resetMs < now) {
      const resetAt = new Date(now + windowSec * 1000).toISOString();
      db.prepare(
        "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) " +
        "ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at"
      ).run(key, resetAt);
      return { ok: true, retryAfter: 0 };
    }
    if (row.count >= max) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((resetMs - now) / 1000)) };
    }
    db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
    return { ok: true, retryAfter: 0 };
  })();
}

/** 多桶同时判定（例如登录同时限 IP 与账号），任一超限即拒绝 */
export function consumeAll(
  buckets: { key: string; max: number; windowSec: number }[]
): { ok: boolean; retryAfter: number; blockedKey?: string } {
  let worst: { retryAfter: number; key: string } | null = null;
  for (const b of buckets) {
    const r = consume(b.key, b.max, b.windowSec);
    if (!r.ok && (!worst || r.retryAfter > worst.retryAfter)) worst = { retryAfter: r.retryAfter, key: b.key };
  }
  return worst ? { ok: false, retryAfter: worst.retryAfter, blockedKey: worst.key } : { ok: true, retryAfter: 0 };
}

/** 登录成功后清掉该账号的失败计数，避免正常用户被自己的历史失败拖累 */
export function reset(keys: string[]): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM rate_limits WHERE key = ?");
  db.transaction(() => { for (const k of keys) del.run(k); })();
}

/** 定期清理过期窗口，避免表无限增长（原先只增不减） */
export function pruneRateLimits(olderThanHours = 24): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
  return db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(cutoff).changes;
}

export function rateLimitStats(): { keys: number } {
  const db = getDb();
  return { keys: (db.prepare("SELECT COUNT(*) c FROM rate_limits").get() as { c: number }).c };
}

export const nowForTest = nowIso;
