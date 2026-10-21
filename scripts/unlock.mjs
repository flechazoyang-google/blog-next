#!/usr/bin/env node
/**
 * 手动解除登录锁定。
 *
 * 为什么需要它：登录限流是「账号 10 次/小时 + IP 20 次/小时」双桶。
 * 正常登录成功会清账号桶，但只要你连续输错几次（或自己跑接口测试），
 * 就可能被自己锁在门外，而这时唯一的办法就是干等一小时 —— 不合理的。
 *
 * 用法：
 *   node scripts/unlock.mjs                    # 看当前计数
 *   node scripts/unlock.mjs --account flechazo # 只解该账号
 *   node scripts/unlock.mjs --all              # 全清（等同"我确认没有被攻击"）
 *   node scripts/unlock.mjs --ip 1.2.3.4       # 解某个 IP
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB = path.join(DATA_DIR, "blog.db");
if (!fs.existsSync(DB)) { console.error("数据库不存在：" + DB); process.exit(1); }

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const account = arg("--account");
const ip = arg("--ip");
const all = argv.includes("--all");

const db = new Database(DB);
db.pragma("journal_mode = WAL");

const rows = db.prepare("SELECT key, count, reset_at FROM rate_limits ORDER BY reset_at").all();
if (!rows.length) {
  console.log("当前没有任何限流记录，账号未被锁定。");
  db.close();
  process.exit(0);
}

const now = Date.now();
console.log("当前限流记录：");
for (const r of rows) {
  const left = Math.round((new Date(r.reset_at).getTime() - now) / 60000);
  const flag = left > 0 ? "生效中" : "已过期";
  console.log("  " + r.key.padEnd(32) + " count=" + String(r.count).padEnd(4) + " 剩余 " + String(left).padStart(4) + " 分钟  (" + flag + ")");
}

if (!account && !ip && !all) {
  console.log("\n以上只是查看。要解锁：");
  console.log("  node scripts/unlock.mjs --account <用户名>   # 解账号");
  console.log("  node scripts/unlock.mjs --all                # 全清（确认没有被攻击时用）");
  db.close();
  process.exit(0);
}

let removed = 0;
db.transaction(() => {
  if (all) {
    removed += db.prepare("DELETE FROM rate_limits").run().changes;
  }
  if (account) {
    removed += db.prepare("DELETE FROM rate_limits WHERE key = ?").run("login:acct:" + account.toLowerCase()).changes;
  }
  if (ip) {
    removed += db.prepare("DELETE FROM rate_limits WHERE key = ?").run("login:ip:" + ip).changes;
  }
  // 顺手清过期项，避免表无限增长
  removed += db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(new Date(now).toISOString()).changes;
})();

console.log("\n已清除 " + removed + " 条限流记录。可以重新登录了。");
const left = db.prepare("SELECT key, count FROM rate_limits").all();
console.log("剩余记录：" + (left.length ? left.map((r) => r.key + "=" + r.count).join(", ") : "无"));
db.close();
