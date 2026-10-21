#!/usr/bin/env node
/**
 * 把 standalone 产物组装成可直接部署的目录 dist/
 *
 * 注意：.next/standalone 里有符号链接（Next.js 用来避免重复打包原生模块，
 * 例如 .next/node_modules/better-sqlite3-<hash> -> node_modules/better-sqlite3）。
 * Linux 上 tar 会原样保留；Windows 上我们要把它"实体化"成目录，否则复制会失败。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist");
const STANDALONE = path.join(ROOT, ".next", "standalone");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);

    let stat;
    try { stat = fs.lstatSync(s); } catch { continue; }

    if (stat.isSymbolicLink()) {
      // 解析链接目标，实体化复制
      let target;
      try { target = fs.realpathSync(s); } catch { console.warn("dangling link, skip:", s); continue; }
      const tstat = fs.statSync(target);
      if (tstat.isDirectory()) copyDir(target, d);
      else fs.copyFileSync(target, d);
      continue;
    }

    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(STANDALONE, OUT);
copyDir(path.join(ROOT, ".next", "static"), path.join(OUT, ".next", "static"));
if (fs.existsSync(path.join(ROOT, "public"))) copyDir(path.join(ROOT, "public"), path.join(OUT, "public"));
copyDir(path.join(ROOT, "scripts"), path.join(OUT, "scripts"));
if (fs.existsSync(path.join(ROOT, "content"))) copyDir(path.join(ROOT, "content"), path.join(OUT, "content"));
if (fs.existsSync(path.join(ROOT, "deploy"))) copyDir(path.join(ROOT, "deploy"), path.join(OUT, "deploy"));

console.log("dist ready:", OUT);
