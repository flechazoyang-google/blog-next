import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { migrate, hasFts } from "./migrations";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "blog.db");

let _db: Database.Database | null = null;
let _fts: boolean | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  // DDL 的唯一来源（原先这里和 scripts/init-db.mjs 各有一份，会漂移）
  const res = migrate(db);
  if (res.applied.length) console.log("[db] migrations applied:", res.applied.join(", "));
  _fts = hasFts(db);
  _db = db;
  return db;
}

/** FTS5 是否可用；不可用时搜索降级为 LIKE（方案 §5 风险 1） */
export function ftsAvailable(): boolean {
  if (_fts === null) getDb();
  return !!_fts;
}

export function dbPath(): string {
  return DB_PATH;
}

/**
 * 关闭并重置单例。
 * 只给测试用：node --test 每个文件同一进程，切换 DATA_DIR 时必须先重置，
 * 否则会沿用上一个测试打开的库（表现为"搜出了别的库的文章"）。
 */
export function closeDb(): void {
  if (_db) {
    try { _db.close(); } catch { /* 已关闭 */ }
    _db = null;
  }
  _fts = null;
}

export type PostType = "post" | "page" | "shuoshuo";
export type PostStatus = "draft" | "published";

export type Post = {
  id: number; type: PostType; title: string; slug: string;
  content: string; excerpt: string; status: PostStatus;
  categories: string; tags: string; cover: string | null; wp_id: number | null;
  published_at: string | null; created_at: string; updated_at: string;
  deleted_at: string | null;
};

export type Comment = {
  id: number; post_id: number; author: string; email: string; url: string;
  content: string; status: "pending" | "approved" | "spam";
  ip: string; user_agent: string;
  parent_id: number | null; created_at: string;
};

export type MediaRow = {
  id: number; path: string; filename: string; mime: string; size: number;
  created_at: string; width: number | null; height: number | null;
  title: string; sha256: string | null;
};

export type AuditRow = {
  id: number; actor_user_id: number | null; actor_name: string; action: string;
  target_type: string | null; target_id: string | null; meta_json: string;
  ip: string; user_agent: string; created_at: string;
};
