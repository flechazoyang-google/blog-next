#!/usr/bin/env node
/** 把 /root/blog-migrate/out 的转换结果导入 SQLite */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import matter from "gray-matter";


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

const SRC = process.env.MIGRATE_SRC || "/root/blog-migrate/out";
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const db = new Database(path.join(DATA_DIR, "blog.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function excerptOf(md, len = 160) {
  return md.replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`-]/g, "").replace(/\s+/g, " ").trim().slice(0, len);
}

function readDir(sub) {
  const dir = path.join(SRC, sub);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const { data, content } = matter(raw);
    return { data, content: content.trim() };
  });
}

let nPost = 0, nPage = 0, nShuo = 0, nComment = 0;

// 文章
for (const { data, content } of readDir("posts")) {
  const slug = String(data.slug || "").trim();
  if (!slug) { console.warn("跳过无 slug:", data.title); continue; }
  const d = normalizeDate(data.date) || "";
  db.prepare(`INSERT INTO posts (type,title,slug,content,excerpt,status,categories,tags,wp_id,published_at)
    VALUES ('post',?,?,?,?,'published',?,?,?,?)
    ON CONFLICT(type,slug) DO UPDATE SET title=excluded.title, content=excluded.content,
      excerpt=excluded.excerpt, categories=excluded.categories, tags=excluded.tags, published_at=excluded.published_at`)
    .run(data.title || "", slug, content, excerptOf(content),
         JSON.stringify(data.categories || []), JSON.stringify(data.tags || []),
         data.wp_id || null, d);
  nPost++;
}

// 页面
for (const { data, content } of readDir("pages")) {
  const slug = String(data.slug || "").trim();
  if (!slug) continue;
  const d = normalizeDate(data.date) || "";
  db.prepare(`INSERT INTO posts (type,title,slug,content,excerpt,status,categories,tags,wp_id,published_at)
    VALUES ('page',?,?,?,?,'published','[]','[]',?,?)
    ON CONFLICT(type,slug) DO UPDATE SET title=excluded.title, content=excluded.content`)
    .run(data.title || "", slug, content, excerptOf(content), data.wp_id || null, d);
  nPage++;
}

// 说说
for (const { data, content } of readDir("shuoshuo")) {
  const d = normalizeDate(data.date) || "";
  const slug = "shuo-" + (data.wp_id || d.replace(/\D/g, "").slice(0, 14));
  db.prepare(`INSERT INTO posts (type,title,slug,content,excerpt,status,categories,tags,wp_id,published_at)
    VALUES ('shuoshuo','',?,?,'','published','[]','[]',?,?)
    ON CONFLICT(type,slug) DO UPDATE SET content=excluded.content`)
    .run(slug, content, data.wp_id || null, d);
  nShuo++;
}

// 评论
const cfile = path.join(SRC, "comments.json");
if (fs.existsSync(cfile)) {
  const list = JSON.parse(fs.readFileSync(cfile, "utf8"));
  for (const c of list) {
    let post = null;
    // 按 slug 找；找不到再按标题兜底（旧站页面 slug 是 URL 编码）
    post = db.prepare("SELECT id FROM posts WHERE type=? AND slug=?").get(c.post_type, c.post_slug);
    if (!post) post = db.prepare("SELECT id FROM posts WHERE title=? LIMIT 1").get(c.post_title);
    // 留言板 → 关于页（新站没有独立留言板）
    if (!post && c.post_title === "留言板") {
      post = db.prepare("SELECT id FROM posts WHERE type='page' AND slug='about'").get();
    }
    // 友链/留言板这类页面已跳过，评论就跳过
    if (!post) { console.warn("评论跳过（原页面未迁移）:", c.author, "->", c.post_title); continue; }
    const dup = db.prepare("SELECT 1 FROM comments WHERE post_id=? AND author=? AND content=? AND created_at=?")
      .get(post.id, c.author, c.content, c.date.replace("T", " ").slice(0, 19));
    if (dup) continue;
    db.prepare(`INSERT INTO comments (post_id,author,email,url,content,status,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(
      post.id, c.author, c.email || "", c.url || "", c.content,
      c.status === "spam" ? "spam" : "approved",
      c.date.replace("T", " ").slice(0, 19));
    nComment++;
  }
}

// ===== 补充自建页面（不来自 WordPress，放在 content/pages/）=====
const SEED_PAGES = path.join(process.cwd(), "content", "pages");
let nSeed = 0;
if (fs.existsSync(SEED_PAGES)) {
  for (const f of fs.readdirSync(SEED_PAGES).filter((x) => x.endsWith(".md"))) {
    const rawSeed = fs.readFileSync(path.join(SEED_PAGES, f), "utf8");
    const parsed = matter(rawSeed);
    const data = parsed.data;
    const content = parsed.content;
    const slug = String(data.slug || f.replace(/\.md$/, "")).trim();
    const d = normalizeDate(data.date) || new Date().toISOString().slice(0, 19);
    db.prepare(
      "INSERT INTO posts (type,title,slug,content,excerpt,status,categories,tags,published_at) " +
      "VALUES ('page',?,?,?,?,'published','[]','[]',?) " +
      "ON CONFLICT(type,slug) DO UPDATE SET title=excluded.title, content=excluded.content, excerpt=excluded.excerpt"
    ).run(data.title || f, slug, content.trim(), excerptOf(content), d);
    nSeed++;
  }
}

console.log("导入完成: 文章 " + nPost + " / 页面 " + nPage + " / 种子页 " + nSeed + " / 说说 " + nShuo + " / 评论 " + nComment);
