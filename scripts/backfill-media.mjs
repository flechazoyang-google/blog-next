#!/usr/bin/env node
/**
 * 把磁盘上已有的图片登记进 media 表（一次性）。
 *
 * 背景：media 表建了但**从来没有代码往里写过全量数据**（上传接口只写新图，
 * 而历史上 18 张 WordPress 迁移过来的图从没登记）。结果是媒体库是空的，
 * 孤儿扫描把它们全报成"孤儿"，也不受"删除前检查引用"的保护。
 *
 * 用法：
 *   node scripts/backfill-media.mjs            # dry-run，只列清单
 *   node scripts/backfill-media.mjs --apply    # 写入 media 表
 */
import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const IMGDIR = process.env.UPLOAD_DIR || "/var/www/blog-images";
const DB = path.join(DATA_DIR, "blog.db");

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif" };

function walk(dir, rel = "", out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const nextRel = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), nextRel, out);
    else out.push(nextRel);
  }
  return out;
}

/** 读 PNG/GIF/JPEG 宽高（只为媒体库能显示尺寸，失败不影响登记） */
function imageSize(buf, mime) {
  try {
    if (mime === "image/png" && buf.length > 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (mime === "image/gif" && buf.length > 10) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch { /* 尺寸解析失败无妨 */ }
  return null;
}

if (!fs.existsSync(IMGDIR)) { console.error("图片目录不存在：" + IMGDIR); process.exit(1); }
if (!fs.existsSync(DB)) { console.error("数据库不存在：" + DB); process.exit(1); }

const db = new Database(DB);
db.pragma("journal_mode = WAL");

const files = walk(IMGDIR).filter((f) => MIME[path.extname(f).toLowerCase()]);
const known = new Set(db.prepare("SELECT path FROM media").all().map((r) => r.path));
const todo = files.filter((f) => !known.has("/images/" + f));

console.log("图片目录：" + IMGDIR);
console.log("磁盘图片：" + files.length + " 张；库内已有：" + known.size + " 条；待登记：" + todo.length + " 张");
console.log("模式：" + (APPLY ? "APPLY" : "DRY-RUN（加 --apply 才写）"));

for (const f of todo.slice(0, 20)) console.log("  + /images/" + f);

if (!APPLY) { console.log("\n确认无误后加 --apply 执行。"); db.close(); process.exit(0); }

const ins = db.prepare(
  "INSERT OR IGNORE INTO media (path, filename, mime, size, width, height, sha256, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
let n = 0;
db.transaction(() => {
  for (const f of todo) {
    const abs = path.join(IMGDIR, f);
    const st = fs.statSync(abs);
    const buf = fs.readFileSync(abs);
    const mime = MIME[path.extname(f).toLowerCase()];
    const size = imageSize(buf, mime);
    const title = path.basename(f, path.extname(f));
    ins.run("/images/" + f, path.basename(f), mime, st.size, size?.w ?? null, size?.h ?? null,
      crypto.createHash("sha256").update(buf).digest("hex"), title,
      new Date(st.mtimeMs).toISOString());
    n++;
  }
})();
console.log("\n已登记 " + n + " 张，库内共 " + db.prepare("SELECT COUNT(*) c FROM media").get().c + " 条");
db.close();
