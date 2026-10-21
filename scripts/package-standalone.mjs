#!/usr/bin/env node
/** 把 standalone 产物组装成可直接部署的目录 dist/ */
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
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    // standalone 里有 pnpm/npm 生成的符号链接，Windows 下 copyFile 会 EPERM；
    // 服务器上是 tar 传输，链接会原样保留，这里只需保证不崩。
    let isLink = false;
    try { isLink = fs.lstatSync(s).isSymbolicLink(); } catch {}
    if (isLink) {
      try { fs.copyFileSync(s, d); } catch { /* 链接目标不可读就跳过 */ }
      continue;
    }
    if (e.isDirectory()) copyDir(s, d);
    else try { fs.copyFileSync(s, d); } catch (err) { console.warn("skip:", s); }
  }
}

copyDir(STANDALONE, OUT);
copyDir(path.join(ROOT, ".next", "static"), path.join(OUT, ".next", "static"));
if (fs.existsSync(path.join(ROOT, "public"))) copyDir(path.join(ROOT, "public"), path.join(OUT, "public"));
copyDir(path.join(ROOT, "scripts"), path.join(OUT, "scripts"));
if (fs.existsSync(path.join(ROOT, "deploy"))) copyDir(path.join(ROOT, "deploy"), path.join(OUT, "deploy"));

console.log("dist ready:", OUT);
