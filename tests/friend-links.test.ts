import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrate, hasTable, hasColumn } from "../lib/migrations.ts";
import { isSafeUrl } from "../lib/friend-links.ts";

const fresh = () => { const db = new Database(":memory:"); migrate(db); return db; };

test("0011 建立 friend_links 表与索引", () => {
  const db = fresh();
  assert.ok(hasTable(db, "friend_links"), "应有 friend_links 表");
  for (const c of ["id", "name", "url", "desc", "kind", "sort_order", "visible", "created_at", "updated_at"])
    assert.ok(hasColumn(db, "friend_links", c), "应有列 " + c);
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_friend_links_order'").get();
  assert.ok(idx, "应有排序索引");
  db.close();
});

test("默认值：kind=friend / visible=1 / sort_order=100", () => {
  const db = fresh();
  db.prepare("DELETE FROM friend_links").run();
  db.prepare("INSERT INTO friend_links (name, url) VALUES ('某站', 'https://example.com')").run();
  const row = db.prepare("SELECT * FROM friend_links").get() as { kind: string; visible: number; sort_order: number };
  assert.equal(row.kind, "friend");
  assert.equal(row.visible, 1);
  assert.equal(row.sort_order, 100);
  db.close();
});

test("排序按 sort_order 升序，同值按 id 保序", () => {
  const db = fresh();
  db.prepare("DELETE FROM friend_links").run();
  const ins = db.prepare("INSERT INTO friend_links (name, url, sort_order) VALUES (?, ?, ?)");
  ins.run("C", "https://c.com", 20);
  ins.run("A", "https://a.com", 10);
  ins.run("B", "https://b.com", 10);
  const names = (db.prepare("SELECT name FROM friend_links ORDER BY sort_order ASC, id ASC").all() as { name: string }[])
    .map((r) => r.name);
  assert.deepEqual(names, ["A", "B", "C"]);
  db.close();
});

test("外链只允许 http/https（防 javascript: 存储型 XSS）", () => {
  assert.equal(isSafeUrl("https://www.travellings.cn/go.html"), true);
  assert.equal(isSafeUrl("http://example.com"), true);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "vbscript:x", "not a url", ""]) {
    assert.equal(isSafeUrl(bad), false, "应拒绝: " + bad);
  }
});

test("迁移可重复执行且不重复建表", () => {
  const db = fresh();
  assert.deepEqual(migrate(db).applied, [], "第二次不应再应用");
  db.close();
});

test("迁移预置「开往」外链，且重复执行不重复插入", () => {
  const db = new Database(":memory:");
  migrate(db);
  const rows = db.prepare("SELECT name, url, kind, sort_order FROM friend_links").all() as
    { name: string; url: string; kind: string; sort_order: number }[];
  assert.equal(rows.length, 1, "全新库应预置且仅预置 1 条");
  assert.equal(rows[0].name, "开往");
  assert.equal(rows[0].url, "https://www.travellings.cn/go.html");
  assert.equal(rows[0].kind, "hub", "开往归为聚合类");
  assert.equal(rows[0].sort_order, 10, "排在最前");

  migrate(db);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM friend_links").get() as { c: number }).c, 1, "重跑不应重复插入");
  db.close();
});

test("用户删掉预置项后，重跑迁移不会复活它", () => {
  const db = new Database(":memory:");
  migrate(db);
  db.prepare("DELETE FROM friend_links").run();
  migrate(db);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM friend_links").get() as { c: number }).c, 0, "迁移只跑一次，不复活");
  db.close();
});
