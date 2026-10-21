import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrate, hasFts, hasColumn, hasTable, sha256hex, migrationNames, currentVersion } from "../lib/migrations.ts";

const fresh = () => new Database(":memory:");

test("迁移建立全部基线表，且重复执行为空", () => {
  const db = fresh();
  assert.ok(migrate(db).applied.length > 0, "首次执行应应用迁移");
  const r2 = migrate(db);
  assert.deepEqual(r2.applied, [], "第二次不应再应用任何东西");
  for (const t of ["posts", "comments", "media", "users", "sessions", "settings", "rate_limits", "audit_log", "post_aliases", "recovery_codes", "schema_version"])
    assert.ok(hasTable(db, t), "应有表 " + t);
  assert.equal(r2.version, migrationNames()[migrationNames().length - 1]);
  db.close();
});

test("新增列齐全，且明文 token 列被彻底移除", () => {
  const db = fresh();
  migrate(db);
  assert.ok(hasColumn(db, "posts", "deleted_at"), "软删除列");
  assert.ok(hasColumn(db, "sessions", "token_hash"), "会话哈希列");
  assert.ok(!hasColumn(db, "sessions", "token"), "明文 token 列必须不存在");
  assert.ok(hasColumn(db, "sessions", "auth_at"), "step-up 时间窗列");
  assert.ok(hasColumn(db, "users", "totp_pending"), "服务端待确认密钥");
  assert.ok(hasColumn(db, "users", "role"), "多用户留位");
  assert.ok(hasColumn(db, "media", "sha256"), "媒体去重哈希");
  db.close();
});

test("0002 把老库的明文 token 转成哈希并保住会话", () => {
  // 模拟老结构：token 作主键
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, totp_secret TEXT, totp_enabled INTEGER DEFAULT 0, created_at TEXT)");
  db.exec("CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER, expires_at TEXT, created_at TEXT)");
  db.prepare("INSERT INTO users (id, username, password_hash) VALUES (1, 'admin', 'hash')").run();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES ('abc123', 1, '2999-01-01T00:00:00.000Z')").run();

  migrate(db);

  assert.ok(!hasColumn(db, "sessions", "token"), "明文列已重建掉");
  const row = db.prepare("SELECT token_hash FROM sessions WHERE user_id = 1").get() as { token_hash: string } | undefined;
  assert.ok(row, "会话在迁移后仍存在");
  assert.equal(row!.token_hash, sha256hex("abc123"), "历史值转为自身哈希");
  assert.notEqual(row!.token_hash, "abc123", "库里不再有明文");
  // 旧 Cookie 经哈希后仍能命中
  const hit = db.prepare("SELECT user_id FROM sessions WHERE token_hash = ?").get(sha256hex("abc123")) as { user_id: number } | undefined;
  assert.equal(hit?.user_id, 1, "旧 Cookie 仍可验证通过");
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0, "重建后外键完好");
  db.close();
});

test("FTS5 建立，触发器保持同步", () => {
  const db = fresh();
  migrate(db);
  assert.ok(hasFts(db), "FTS5 在 better-sqlite3 12.11.1 / SQLite 3.53.2 可用");

  const info = db
    .prepare("INSERT INTO posts (type, slug, title, content) VALUES ('post', 'p1', 'Hough Transform', 'hough transform edge detection')")
    .run();
  const c = (q: string) => (db.prepare("SELECT count(*) c FROM posts_fts WHERE posts_fts MATCH ?").get(q) as { c: number }).c;
  assert.equal(c('"transform"'), 1, "INSERT 触发器已索引");

  db.prepare("UPDATE posts SET content = 'quantum tunneling essay' WHERE id = ?").run(info.lastInsertRowid);
  assert.equal(c('"detection"'), 0, "UPDATE 后旧正文不再命中");
  assert.equal(c('"tunneling"'), 1, "UPDATE 后新正文可命中");

  db.prepare("DELETE FROM posts WHERE id = ?").run(info.lastInsertRowid);
  assert.equal(c('"tunneling"'), 0, "DELETE 触发器清理");
  db.close();
});

test("trigram 对中文生效，且 >=3 字符是硬要求（故需 LIKE 兜底）", () => {
  const db = fresh();
  migrate(db);
  db.prepare("INSERT INTO posts (type, slug, title, content) VALUES ('post','p4','霍夫变换底层原理','介绍霍夫变换在图像检测中的应用')").run();
  const c = (q: string) => (db.prepare("SELECT count(*) c FROM posts_fts WHERE posts_fts MATCH ?").get(q) as { c: number }).c;
  // 3 字以上子串可命中
  assert.equal(c('"霍夫变换"'), 1, "四字中文词命中");
  assert.equal(c('"图像检测"'), 1, "正文中文词命中");
  // 2 字（trigram 最短 3）命中不到 —— 这正是 lib/search.ts 要降级 LIKE 的原因
  assert.equal(c('"变换"'), 0, "二字查询命中不到，必须由 LIKE 兜底");
  db.close();
});

test("迁移不破坏既有数据", () => {
  const db = fresh();
  migrate(db);
  db.prepare("INSERT INTO posts (type, slug, title, content, status, published_at) VALUES ('post','live','Kept','body','published','2026-01-01T00:00:00.000Z')").run();
  db.prepare("INSERT INTO comments (post_id, author, content, status) VALUES (1,'guest','hi','approved')").run();
  assert.deepEqual(migrate(db).applied, []);
  assert.equal((db.prepare("SELECT count(*) c FROM posts").get() as { c: number }).c, 1);
  assert.equal((db.prepare("SELECT count(*) c FROM comments").get() as { c: number }).c, 1);
  assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  assert.equal(currentVersion(db), migrationNames()[migrationNames().length - 1]);
  db.close();
});
