import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "blog.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  _db = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT NOT NULL CHECK (type IN ('post','page','shuoshuo')),
      title        TEXT NOT NULL DEFAULT '',
      slug         TEXT NOT NULL,
      content      TEXT NOT NULL DEFAULT '',
      excerpt      TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
      categories   TEXT NOT NULL DEFAULT '[]',
      tags         TEXT NOT NULL DEFAULT '[]',
      cover        TEXT,
      wp_id        INTEGER,
      published_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(type, slug)
    );
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type, status);

    CREATE TABLE IF NOT EXISTS comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author      TEXT NOT NULL,
      email       TEXT NOT NULL DEFAULT '',
      url         TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','spam')),
      ip          TEXT NOT NULL DEFAULT '',
      user_agent  TEXT NOT NULL DEFAULT '',
      parent_id   INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, status);

    CREATE TABLE IF NOT EXISTS media (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      path       TEXT NOT NULL UNIQUE,
      filename   TEXT NOT NULL,
      mime       TEXT NOT NULL,
      size       INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      totp_secret   TEXT,
      totp_enabled  INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      key        TEXT PRIMARY KEY,
      count      INTEGER NOT NULL DEFAULT 0,
      reset_at   TEXT NOT NULL
    );
  `);
}

export type Post = {
  id: number; type: "post" | "page" | "shuoshuo"; title: string; slug: string;
  content: string; excerpt: string; status: "draft" | "published";
  categories: string; tags: string; cover: string | null; wp_id: number | null;
  published_at: string | null; created_at: string; updated_at: string;
};

export type Comment = {
  id: number; post_id: number; author: string; email: string; url: string;
  content: string; status: "pending" | "approved" | "spam";
  parent_id: number | null; created_at: string;
};
