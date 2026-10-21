#!/usr/bin/env node
/**
 * 把 Umami 的统计数据拉下来写进本地 SQLite（方案 C11 / P4）。
 *
 * 为什么要有这个脚本：
 *   原实现在**每个文章页的 SSR 路径里**同步 await 一次 Umami 的 HTTP 接口。
 *   Umami 是 Docker 里的服务（实测 344MB），是这台机上最不稳定的邻居 ——
 *   它一慢，文章页就慢；它一挂，文章页直接 500。
 *   改成定时拉取 + 本地读，统计挂了最多让数字变旧，站点永远可达。
 *
 * 用法：node scripts/sync-umami.mjs
 * 环境：UMAMI_API_URL、UMAMI_WEBSITE_ID、UMAMI_TOKEN、DATA_DIR
 * 定时：deploy/umami-sync.timer（每 5 分钟）
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB = path.join(DATA_DIR, "blog.db");
const BASE = process.env.UMAMI_API_URL;
const SITE = process.env.UMAMI_WEBSITE_ID;
const TOKEN = process.env.UMAMI_TOKEN;

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

if (!BASE || !SITE || !TOKEN) {
  log("Umami 未配置（需要 UMAMI_API_URL / UMAMI_WEBSITE_ID / UMAMI_TOKEN），跳过");
  process.exit(0);
}
if (!fs.existsSync(DB)) {
  log("数据库不存在：" + DB);
  process.exit(1);
}

const db = new Database(DB);
const setStmt = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

const end = Date.now();
const start = end - 365 * 86400000;

/** 带超时的 fetch：绝不因为统计服务挂住而拖住同步任务 */
async function jget(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const res = await fetch(url, { headers: { Authorization: "Bearer " + TOKEN }, signal: ac.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

try {
  // 1) 总浏览量
  const stats = await jget(BASE + "/api/websites/" + SITE + "/stats?startAt=" + start + "&endAt=" + end);
  const pv = typeof stats?.pageviews === "number" ? stats.pageviews : stats?.pageviews?.value;
  const write = db.transaction(() => {
    if (typeof pv === "number") {
      setStmt.run("umami:total", String(pv));
      setStmt.run("umami:total", String(pv)); // 同时满足 getSettings 的 umami:total 映射
    }
    setStmt.run("umami:synced_at", new Date().toISOString());
  });
  write();
  log("总浏览量：" + (typeof pv === "number" ? pv : "(无数据)"));

  // 2) 各路径浏览量（写 umami:path:<path>）
  const rows = await jget(BASE + "/api/websites/" + SITE + "/metrics?startAt=" + start + "&endAt=" + end + "&type=path&limit=500");
  const arr = Array.isArray(rows) ? rows : [];
  db.transaction(() => {
    for (const r of arr) {
      if (typeof r?.x === "string" && typeof r?.y === "number") setStmt.run("umami:path:" + r.x, String(r.y));
    }
  })();
  log("路径统计写入：" + arr.length + " 条");
} catch (e) {
  log("同步失败（保留旧值，不影响站点）：" + e.message);
  process.exit(1);
} finally {
  db.close();
}
