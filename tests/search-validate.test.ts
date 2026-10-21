import { test } from "node:test";
import assert from "node:assert/strict";
import { toFtsQuery, TRIGRAM_MIN } from "../lib/search.ts";
import { searchPosts } from "../lib/search.ts";
import { httpUrl, email, slug, str, strList, safeJsonArray, unwrap, ValidationError, int, oneOf } from "../lib/validate.ts";
import { generateRecoveryCode, normalizeRecoveryCode, hashToken, safeEqual } from "../lib/crypto.ts";

/* ------------------------------- 搜索 ------------------------------- */

test("FTS 查询串被包成短语，注入语法字符失效", () => {
  assert.equal(toFtsQuery("霍夫变换"), '"霍夫变换"');
  // 这些原本可能被当成运算符
  for (const evil of ['a" OR "b', "x NEAR/2 y", 'foo*', "a AND b", "-x"]) {
    const q = toFtsQuery(evil);
    assert.ok(q.startsWith('"') && q.endsWith('"'), "必须以短语形式包裹: " + q);
    assert.equal(q.slice(1, -1).includes('"'), evil.includes('"') ? q.slice(1, -1).includes('""') : false, "内部引号已转义");
  }
});

test("trigram 最短长度为 3（决定何时走 LIKE 兜底）", () => {
  assert.equal(TRIGRAM_MIN, 3);
});

test("空白查询返回空结果，不抛异常", () => {
  assert.deepEqual(searchPosts("").hits, []);
  assert.deepEqual(searchPosts("   ").hits, []);
  assert.equal(searchPosts("").mode, "like");
});

/* ------------------------------- 校验 ------------------------------- */

test("B9：评论网址只允许 http/https", () => {
  assert.equal(httpUrl("https://a.com/x").ok, true);
  assert.equal(httpUrl("http://a.com").ok, true);
  assert.equal(httpUrl("").ok, true, "允许留空");
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "vbscript:x", "not a url"]) {
    assert.equal(httpUrl(bad).ok, false, "应拒绝: " + bad);
  }
});

test("邮箱宽松校验", () => {
  assert.equal(email("a@b.co").ok, true);
  assert.equal(email("").ok, true);
  assert.equal(email("nope").ok, false);
  assert.equal(email("a b@c.com").ok, false);
});

test("slug 白名单：允许中文，拒绝空格/斜杠/前导连字符", () => {
  assert.equal(slug("hough-transform").ok, true);
  assert.equal(slug("霍夫变换").ok, true);
  assert.equal(slug("-abc").ok, false);
  assert.equal(slug("a/b").ok, false);
  assert.equal(slug("a b").ok, false);
  assert.equal(slug("x".repeat(101)).ok, false, "超长拒绝");
});

test("str 长度与必填", () => {
  assert.deepEqual(str("  hi  ", { field: "f" }), { ok: true, value: "hi" }, "默认 trim");
  assert.equal(str("", { field: "f", required: true }).ok, false);
  assert.equal(str("x".repeat(201), { field: "f", max: 200 }).ok, false);
});

test("strList 兼容数组与逗号串，并去重去空", () => {
  assert.deepEqual(unwrap(strList("a, b ,, a", { field: "t" })), ["a", "b"]);
  assert.deepEqual(unwrap(strList(["x", "y", "x"], { field: "t" })), ["x", "y"]);
  assert.deepEqual(unwrap(strList(null, { field: "t" })), []);
});

test("B6：safeJsonArray 对脏数据不抛异常", () => {
  assert.deepEqual(safeJsonArray('["a","b"]'), ["a", "b"]);
  assert.deepEqual(safeJsonArray("not json"), []);
  assert.deepEqual(safeJsonArray('{"a":1}'), [], "对象不算数组");
  assert.deepEqual(safeJsonArray(null), []);
  assert.deepEqual(safeJsonArray(""), []);
  assert.deepEqual(safeJsonArray('["a",1,true]'), ["a", "1", "true"]);
});

test("unwrap 失败时抛 400 语义的错误", () => {
  assert.throws(() => unwrap(slug("-bad")), (e: unknown) => e instanceof ValidationError && e.status === 400);
});

test("int / oneOf", () => {
  assert.equal(unwrap(int("42", { field: "id" })), 42);
  assert.equal(int("abc", { field: "id" }).ok, false);
  assert.equal(int(1.5, { field: "id" }).ok, false, "非整数拒绝");
  assert.equal(int(0, { field: "id", min: 1 }).ok, false);
  assert.equal(unwrap(oneOf("page", ["post", "page"] as const, { field: "t" })), "page");
  assert.equal(oneOf("nope", ["post"] as const, { field: "t" }).ok, false);
  // B7：非法 type 现在能给出明确错误，而不是撞 CHECK 抛 500
});

/* ------------------------------- 恢复码 ------------------------------- */

test("恢复码格式稳定、归一化忽略大小写与分隔符", () => {
  const code = generateRecoveryCode();
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(normalizeRecoveryCode(code), code.replace(/-/g, ""));
  assert.equal(normalizeRecoveryCode(code.toLowerCase()), code.replace(/-/g, ""));
  assert.equal(normalizeRecoveryCode(" " + code.split("").join(" ") + " "), code.replace(/-/g, ""));
});

test("恢复码不含易混字符 0/O/1/I", () => {
  for (let i = 0; i < 40; i++) {
    assert.doesNotMatch(generateRecoveryCode().replace(/-/g, ""), /[01OI]/);
  }
});

test("会话 token 哈希：长度固定、确定、不同输入不同结果", () => {
  const a = hashToken("token-a");
  assert.equal(a, hashToken("token-a"));
  assert.notEqual(a, hashToken("token-b"));
  assert.match(a, /^[0-9a-f]{64}$/, "sha256 hex");
  assert.equal(safeEqual(a, a), true);
  assert.equal(safeEqual(a, hashToken("other")), false);
  assert.equal(safeEqual(a, a.slice(0, 10)), false, "长度不同直接 false");
});

