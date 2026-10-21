#!/usr/bin/env node
/**
 * 时间基准修复（方案 P1-1 / B1 / B2）—— **唯一会改写历史数据的脚本**。
 *
 * ────────────────────────────────────────────────────────────────
 * 实测到的真实数据形态（务必先读这段）：
 *
 *   posts.published_at 有两种历史脏值：
 *     a) 被截断的 Date.toString()：  " ue Apr 21 2026 22:"   （17 条）
 *        → 原本应是 "Tue Apr 21 2026 22:30:00 GMT+0800 (CST)"，
 *          被 slice(0,19) 截断，**分钟秒已经在源头丢失了**，最早只剩小时精度。
 *     b) 正常 naive：                "2026-10-20 18:00:00"
 *
 *   created_at / updated_at / comments.created_at：
 *     来自 SQLite datetime('now') = **UTC**，也是 naive 形态。
 *
 * 关键陷阱：
 *   同一个 "YYYY-MM-DD HH:MM:SS" 形态，语义却不同 ——
 *   published_at 是迁移时按**服务器本地时区（CST）**生成的，
 *   而 created_at 是 SQLite 按 **UTC** 生成的。
 *   并且 new Date(" ue Apr 21 2026 22:") 的解析结果**依赖运行时 TZ**
 *   （CST 下得 23:00Z，UTC 下得 07:00Z，差 8 小时）。
 *
 *   所以本脚本**不依赖运行时 TZ**：显式按列的语义去构造带偏移的时间串。
 * ────────────────────────────────────────────────────────────────
 *
 * 用法：
 *   node scripts/fix-dates.mjs                    # dry-run（默认，只读）
 *   node scripts/fix-dates.mjs --apply            # 执行（单事务 + 完整性校验）
 *   node scripts/fix-dates.mjs --tz=Asia/Shanghai # 覆盖 published_at 的解释时区
 * 前置：先跑 /usr/local/bin/blog-backup 出一份在线快照。
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const TZ = (process.argv.find((a) => a.startsWith("--tz=")) || "--tz=Asia/Shanghai").slice(5);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB = path.join(DATA_DIR, "blog.db");

if (!fs.existsSync(DB)) {
  console.error("数据库不存在：" + DB);
  process.exit(1);
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** 由「本地年-月-日 时:分:秒」+ 时区偏移，算出 UTC ISO —— 完全不用 Date 的本地解析 */
function toUtcIso(y, mo, d, h, mi, se, offsetMinutes) {
  const ms = Date.UTC(y, mo - 1, d, h, mi, se) - offsetMinutes * 60 * 1000;
  return new Date(ms).toISOString();
}

/** 取某时区在指定时刻的偏移分钟数（用 Intl 反查，不依赖运行时 TZ） */
function offsetMinutesAt(isoLike, timeZone) {
  const probe = new Date(isoLike + "Z");
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = dtf.formatToParts(probe).reduce((a, x) => (x.type !== "literal" ? ((a[x.type] = x.value), a) : a), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - probe.getTime()) / 60000);
}

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const TRUNCATED_TOSTRING = /^\s*\w{0,3}\s*([A-Z][a-z]{2}) (\d{1,2}) (\d{4}) (\d{1,2}):/;
const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * 归一化：返回 { iso, basis } —— basis 说明这条值是按什么语义解释的，
 * dry-run 时逐条打印，便于人工复核。
 */
function normalize(raw, assumeTz) {
  const s = String(raw).trim();
  if (!s) return null;

  // 1) 已是带 Z / 带偏移的完整 ISO：直接换算
  if (WITH_OFFSET.test(s)) {
    const t = new Date(s);
    return isNaN(t.getTime()) ? null : { iso: t.toISOString(), basis: "already-iso" };
  }

  // 2) naive "YYYY-MM-DD HH:MM[:SS]"
  const n = NAIVE.exec(s);
  if (n) {
    const [, y, mo, d, h, mi, se = "00"] = n;
    // 用该时区在「这一天」的偏移量（自动处理夏令时；CST 恒为 +8）
    const off = offsetMinutesAt(y + "-" + mo + "-" + d + "T" + h + ":" + mi + ":00", assumeTz);
    return {
      iso: toUtcIso(+y, +mo, +d, +h, +mi, +se, off),
      basis: "naive@" + assumeTz + "(offset " + (off >= 0 ? "+" : "") + off / 60 + "h)",
    };
  }

  // 3) 被截断的 Date.toString()：" ue Apr 21 2026 22:"
  const t = TRUNCATED_TOSTRING.exec(s);
  if (t) {
    const [, mon, day, year, hour] = t;
    const mo = MONTHS[mon];
    if (!mo) return null;
    const off = offsetMinutesAt(year + "-" + String(mo).padStart(2, "0") + "-" + String(+day).padStart(2, "0") + "T" + String(+hour).padStart(2, "0") + ":00:00", assumeTz);
    return {
      iso: toUtcIso(+year, mo, +day, +hour, 0, 0, off),
      // 分钟秒在源头就丢了，只能精确到小时 —— 这里显式标注，别假装精确
      basis: "truncated-tostring@" + assumeTz + " (only hour precision survives)",
    };
  }

  return null;
}

const db = new Database(DB);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

/**
 * 按列声明语义：
 *   published_at  —— 迁移期按**服务器本地时区**生成 => 按 TZ（默认 Asia/Shanghai）
 *   其余 datetime('now') 列 —— SQLite 生成 => UTC
 */
const COLS = [
  { table: "posts", col: "published_at", tz: TZ },
  { table: "posts", col: "created_at", tz: "UTC" },
  { table: "posts", col: "updated_at", tz: "UTC" },
  { table: "posts", col: "deleted_at", tz: "UTC" },
  { table: "comments", col: "created_at", tz: "UTC" },
  { table: "media", col: "created_at", tz: "UTC" },
];

const plan = [];
const unparsed = [];
for (const spec of COLS) {
  let rows;
  try {
    rows = db.prepare("SELECT id, " + spec.col + " AS v FROM " + spec.table).all();
  } catch {
    continue; // 列尚不存在（迁移未跑）
  }
  for (const r of rows) {
    if (r.v === null || r.v === undefined) continue;
    const normalized = normalize(r.v, spec.tz);
    if (!normalized) { unparsed.push({ ...spec, id: r.id, from: r.v }); continue; }
    if (normalized.iso !== String(r.v)) {
      plan.push({ ...spec, id: r.id, from: r.v, to: normalized.iso, basis: normalized.basis });
    }
  }
}

console.log("数据库：" + DB);
console.log("模式：" + (APPLY ? "APPLY（写入）" : "DRY-RUN（只读，加 --apply 才写）"));
console.log("published_at 解释时区：" + TZ + "（其余时间列按 UTC）");
console.log("待修正：" + plan.length + " 条" + (unparsed.length ? "，无法解析：" + unparsed.length + " 条" : "") + "\n");

const byCol = {}, byBasis = {};
for (const p of plan) {
  byCol[p.table + "." + p.col] = (byCol[p.table + "." + p.col] || 0) + 1;
  byBasis[p.basis] = (byBasis[p.basis] || 0) + 1;
}
for (const k of Object.keys(byCol)) console.log("  " + k + ": " + byCol[k]);
console.log("\n解释依据：");
for (const k of Object.keys(byBasis)) console.log("  " + k + ": " + byBasis[k]);

console.log("\n抽样（最多 10 条，含原始值 -> 结果）：");
for (const p of plan.slice(0, 10)) {
  console.log("  " + p.table + "#" + p.id + " " + p.col);
  console.log("    " + JSON.stringify(p.from) + "  ->  " + p.to);
}

if (unparsed.length) {
  console.log("\n!! 以下值无法解析，脚本不会动它们（需人工判断）：");
  for (const u of unparsed.slice(0, 10)) console.log("   " + u.table + "#" + u.id + " " + u.col + " = " + JSON.stringify(u.from));
}

if (!plan.length) { console.log("\n没有需要修正的记录。"); db.close(); process.exit(0); }
if (!APPLY) { console.log("\n确认无误后加 --apply 执行。"); db.close(); process.exit(0); }

const stmts = new Map();
db.transaction(() => {
  for (const p of plan) {
    const key = p.table + "." + p.col;
    if (!stmts.has(key)) stmts.set(key, db.prepare("UPDATE " + p.table + " SET " + p.col + " = ? WHERE id = ?"));
    stmts.get(key).run(p.to, p.id);
  }
})();

const chk = db.prepare("PRAGMA integrity_check").get();
console.log("\n已写入 " + plan.length + " 条；integrity_check = " + chk.integrity_check);

let remain = 0;
for (const spec of COLS) {
  try {
    for (const r of db.prepare("SELECT " + spec.col + " AS v FROM " + spec.table).all()) {
      if (r.v && normalize(r.v, spec.tz) && normalize(r.v, spec.tz).iso !== String(r.v)) remain++;
    }
  } catch { /* 列缺失 */ }
}
console.log("残留未归一：" + remain);
db.close();
