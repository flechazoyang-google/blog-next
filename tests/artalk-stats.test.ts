import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * 评论区数据源（2026-10-23）：博客统计改读 Artalk 的 SQLite。
 *
 * 这里不 import lib/site-stats.ts —— 它顶层依赖 next/cache 的缓存链路。
 * 改为直接用同样的查询语句建一个最小 Artalk 库来验证语义：
 *   1) 待审（is_pending=1）不算
 *   2) 软删除（deleted_at 非空）不算
 *   3) 别的 site_name 不算
 *   4) 文件不存在时返回 null（不是 0）—— 这是关键，
 *      「读不到」和「真的没有评论」必须能区分，否则侧栏会误导
 */

const ARTALK_SITE = "flechazo blog";

function makeArtalkDb(file: string) {
  const db = new Database(file);
  db.exec(
    "CREATE TABLE comments (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, page_key TEXT, " +
      "site_name TEXT, is_pending NUMERIC DEFAULT 0, deleted_at datetime)"
  );
  const ins = db.prepare(
    "INSERT INTO comments (content, page_key, site_name, is_pending, deleted_at) VALUES (?,?,?,?,?)"
  );
  ins.run("审核通过的", "/a", ARTALK_SITE, 0, null);      // 计入
  ins.run("审核通过的2", "/b", ARTALK_SITE, 0, null);     // 计入
  ins.run("待审核的", "/c", ARTALK_SITE, 1, null);        // 不计
  ins.run("已删除的", "/d", ARTALK_SITE, 0, "2026-10-01"); // 不计
  ins.run("别的站点", "/e", "another site", 0, null);      // 不计
  return db;
}

/** 与 lib/site-stats.ts 里的 SQL 保持一致 */
function countComments(file: string): number | null {
  if (!fs.existsSync(file)) return null;
  const db = new Database(file, { readonly: true, fileMustExist: true });
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM comments " +
        "WHERE deleted_at IS NULL AND (is_pending = 0 OR is_pending IS NULL) AND site_name = ?"
    )
    .get(ARTALK_SITE) as { c: number } | undefined;
  db.close();
  return row ? row.c : null;
}

test("评论数只算「已审核 + 未删除 + 本站点」", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artalk-"));
  const file = path.join(dir, "artalk.db");
  const db = makeArtalkDb(file);
  db.close();

  assert.equal(countComments(file), 2, "5 条里只有 2 条该计入");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("库文件不存在时返回 null 而不是 0", () => {
  const missing = path.join(os.tmpdir(), "definitely-not-exists-" + Date.now() + ".db");
  assert.equal(countComments(missing), null, "读不到必须返回 null，交给 UI 显示「—」");
});

test("空库返回 0（真的没有评论）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artalk-"));
  const file = path.join(dir, "artalk.db");
  const db = new Database(file);
  db.exec(
    "CREATE TABLE comments (id INTEGER PRIMARY KEY, content TEXT, page_key TEXT, " +
      "site_name TEXT, is_pending NUMERIC DEFAULT 0, deleted_at datetime)"
  );
  db.close();
  assert.equal(countComments(file), 0, "空表是 0，与 null 区分");
  fs.rmSync(dir, { recursive: true, force: true });
});
