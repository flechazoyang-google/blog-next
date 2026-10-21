import { test } from "node:test";
import assert from "node:assert/strict";
import { toUtcIso, formatIn, dateKeyIn, monthKeyIn, yearKeyIn, nowIso } from "../lib/time.ts";

// 复现方案 B1：02:00 CST 发布 = UTC 前一天 18:00。旧实现落库 "2026-10-20 18:00:00"
// 并被 new Date() 按本地解析 -> 显示 10月20日（倒退一天）。
const naive = "2026-10-20 18:00:00";

test("naive 无标记串按 UTC 解释并补 Z", () => {
  assert.equal(toUtcIso(naive), "2026-10-20T18:00:00.000Z");
});

test("已带 Z 的串幂等", () => {
  assert.equal(toUtcIso("2026-10-20T18:00:00.000Z"), "2026-10-20T18:00:00.000Z");
});

test("T 分隔无标记同样处理", () => {
  assert.equal(toUtcIso("2026-10-20T18:00:00"), "2026-10-20T18:00:00.000Z");
});

test("带偏移的串换算到 UTC", () => {
  assert.equal(toUtcIso("2026-10-21T02:00:00+08:00"), "2026-10-20T18:00:00.000Z");
});

test("B1 回归：02:00 CST 发布，展示时区下仍是 10月21日", () => {
  assert.equal(formatIn(naive, "date", "Asia/Shanghai"), "2026年10月21日");
  assert.equal(dateKeyIn(naive, "Asia/Shanghai"), "2026-10-21");
});

test("UTC 展示时区下才是 10月20日（证明时区参数真的生效）", () => {
  assert.equal(formatIn(naive, "date", "UTC"), "2026年10月20日");
});

test("monthKey / yearKey", () => {
  assert.equal(monthKeyIn(naive, "Asia/Shanghai"), "2026-10");
  assert.equal(yearKeyIn(naive, "Asia/Shanghai"), "2026");
});

test("非法与空值不抛异常", () => {
  assert.equal(toUtcIso("not a date"), null);
  assert.equal(toUtcIso(null), null);
  assert.equal(toUtcIso(""), null);
  assert.equal(formatIn("garbage", "date"), "");
});

test("nowIso 产出带 Z 的完整 ISO（可被 toUtcIso 幂等往返）", () => {
  const s = nowIso();
  assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(toUtcIso(s), s);
});
