#!/usr/bin/env node
/**
 * 定期清理（P2-2 / P4）。
 * 原先 sessions 只在被访问时惰性删除、rate_limits 只增不减，表会单调增长。
 * 建议每小时跑一次（deploy/blog-prune.timer）。
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB = path.join(DATA_DIR, "blog.db");
if (!fs.existsSync(DB)) { console.error("数据库不存在：" + DB); process.exit(1); }

const db = new Database(DB);
db.pragma("journal_mode = WAL");
const now = new Date().toISOString();
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 86400 * 1000).toISOString();

const out = {};
out.sessions = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now).changes;
out.rate_limits = db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(hoursAgo(24)).changes;
out.audit = db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(daysAgo(180)).changes;
// 回收站超过 30 天的彻底删除（连带评论，与后台"彻底删除"语义一致）
out.trash = db.prepare("DELETE FROM posts WHERE deleted_at IS NOT NULL AND deleted_at < ?").run(daysAgo(30)).changes;

console.log(new Date().toISOString(), "pruned", JSON.stringify(out));
db.close();
