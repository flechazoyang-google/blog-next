#!/usr/bin/env node
/**
 * 重建博客数据：从 WordPress 转换结果导入，并做后处理
 *   - 数字 slug 改成语义化 slug
 *   - 重新生成干净的摘要
 *   - 删除重复页面
 *
 * 用法：MIGRATE_SRC=/root/blog-migrate/out DATA_DIR=/var/lib/blog node rebuild.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";


/** 把各种脏日期统一成 "YYYY-MM-DD HH:MM:SS" */
function normalizeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  // 已经是 ISO 或 "YYYY-MM-DD HH:MM:SS"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?[:]?(\d{2})?[:]?(\d{2})?/);
  if (m) {
    const [, y, mo, d, h = "00", mi = "00", se = "00"] = m;
    return y + "-" + mo + "-" + d + " " + h + ":" + mi + ":" + se;
  }
  // "Mon May 25 2026 22:30:00" 这类
  const t = new Date(s);
  if (!isNaN(t.getTime())) {
    const p = (n) => String(n).padStart(2, "0");
    return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate()) + " " +
           p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds());
  }
  return null;
}

const DB = path.join(process.env.DATA_DIR || "/var/lib/blog", "blog.db");
const db = new Database(DB);

// —— slug 修正表：WordPress 的纯数字 slug 改成语义化 ——
const SLUG_FIX = {
  "35": "本地部署开源大模型",
  "39": "markdown语法",
};

for (const [oldS, newS] of Object.entries(SLUG_FIX)) {
  const row = db.prepare("SELECT id FROM posts WHERE type='post' AND slug=?").get(oldS);
  if (!row) continue;
  const dup = db.prepare("SELECT 1 FROM posts WHERE type='post' AND slug=?").get(newS);
  if (dup) continue;
  db.prepare("UPDATE posts SET slug=? WHERE id=?").run(newS, row.id);
  console.log("slug:", oldS, "->", newS);
}

// —— 日期规范化（修 "Mon May 25 2026 22:" 这类脏数据）——
const dateRows = db.prepare("SELECT id, published_at FROM posts").all();
const dateUpd = db.prepare("UPDATE posts SET published_at=? WHERE id=?");
let nDate = 0;
for (const r of dateRows) {
  const fixed = normalizeDate(r.published_at);
  if (fixed && fixed !== r.published_at) { dateUpd.run(fixed, r.id); nDate++; }
}
console.log("日期已规范化:", nDate, "条");

// —— 摘要重生成 ——
const FENCE = "\u0060\u0060\u0060";
function makeExcerpt(md, len = 160) {
  let t = md;
  t = t.split(FENCE).filter((_, i) => i % 2 === 0).join(" ");
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/^\s*\|.*\|\s*$/gm, " ");
  t = t.replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, " ");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/[*_~\u0060>\-]/g, "");
  t = t.replace(/\(?\s*https?:\/\/[^\s)]+\s*\)?/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t.length > len ? t.slice(0, len) + "\u2026" : t;
}

const rows = db.prepare("SELECT id, content FROM posts WHERE type IN ('post','page')").all();
const upd = db.prepare("UPDATE posts SET excerpt=? WHERE id=?");
for (const r of rows) upd.run(makeExcerpt(r.content), r.id);
console.log("摘要已重生成:", rows.length, "条");

// —— 清理无内容的重复页面 ——
const bad = db.prepare("SELECT id, slug FROM posts WHERE type='page' AND LENGTH(TRIM(content))=0").all();
for (const b of bad) {
  db.prepare("DELETE FROM posts WHERE id=?").run(b.id);
  console.log("删除空页面:", b.slug);
}

const c = (sql) => db.prepare(sql).get().c;
console.log("最终:", {
  posts: c("SELECT COUNT(*) c FROM posts WHERE type='post'"),
  pages: c("SELECT COUNT(*) c FROM posts WHERE type='page'"),
  shuo: c("SELECT COUNT(*) c FROM posts WHERE type='shuoshuo'"),
  comments: c("SELECT COUNT(*) c FROM comments"),
});
