#!/usr/bin/env node
/**
 * 前端资产比对：本地构建产物  vs  线上实际下发的 CSS/JS
 *
 * 解决什么问题：healthz 的 commit 能告诉你"部署的是哪次提交"，但如果是
 * 手工改过服务器文件、或部分文件没覆盖成功，commit 字段照样显示新版本
 * —— 因为 .build-info.json 是随包里一起拷过去的。
 *
 * 这个脚本直接从**线上拉真实资产**，和本地 dist 逐字节比哈希。
 * 对不上就说明产物没完整部署。
 *
 * 用法：
 *   node scripts/verify-assets.mjs                       # 比对线上
 *   node scripts/verify-assets.mjs http://127.0.0.1:8090
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const base = (process.argv[2] || "https://blog.yghsite.cn").replace(/\/+$/, "");
const chunksDir = path.join(process.cwd(), "dist", ".next", "static", "chunks");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", OFF = "\x1b[0m";

if (!fs.existsSync(chunksDir)) {
  console.error(`${RED}✗ 本地没有 dist/.next/static/chunks${OFF}`);
  console.error("  先跑 npm run build && npm run build:dist");
  process.exit(2);
}

// 取本地产物里最大的那个 CSS（就是全站样式主包）
const cssFiles = fs
  .readdirSync(chunksDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ f, size: fs.statSync(path.join(chunksDir, f)).size }))
  .sort((a, b) => b.size - a.size);

if (cssFiles.length === 0) {
  console.error(`${RED}✗ 本地 dist 里没有 CSS 产物${OFF}`);
  process.exit(2);
}

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
const localName = cssFiles[0].f;
const localBuf = fs.readFileSync(path.join(chunksDir, localName));

console.log(`目标  ${base}`);
console.log(`本地  ${localName}  ${localBuf.length}B  sha ${sha(localBuf)}`);

// 线上首页引用的 CSS 是哪个？
let homeCss = null;
try {
  const res = await fetch(base + "/", { signal: AbortSignal.timeout(15000), headers: { connection: "close" } });
  const html = await res.text();
  homeCss = (html.match(/\/_next\/static\/chunks\/[\w.-]+\.css/) || [])[0] ?? null;
} catch (e) {
  console.error(`${RED}✗ 取不到线上首页：${e.message}${OFF}`);
  process.exit(2);
}

if (!homeCss) {
  console.error(`${RED}✗ 线上首页没有引用 CSS，异常${OFF}`);
  process.exit(2);
}

const remoteName = homeCss.split("/").pop();
let remoteBuf;
try {
  const res = await fetch(base + homeCss, { signal: AbortSignal.timeout(20000), headers: { connection: "close" } });
  remoteBuf = Buffer.from(await res.arrayBuffer());
} catch (e) {
  console.error(`${RED}✗ 取不到线上 CSS：${e.message}${OFF}`);
  process.exit(2);
}

console.log(`线上  ${remoteName}  ${remoteBuf.length}B  sha ${sha(remoteBuf)}`);

const sameName = localName === remoteName;
const sameHash = sha(localBuf) === sha(remoteBuf);

if (sameName && sameHash) {
  console.log(`\n${GREEN}✓ 前端资产一致${OFF}`);
  process.exitCode = 0;
} else {
  console.log("");
  if (!sameName) console.log(`${RED}✗ 文件名不同：本地 ${localName} ≠ 线上 ${remoteName} —— 线上跑的不是这份构建${OFF}`);
  if (!sameHash) console.log(`${RED}✗ 内容不一致（同名但字节不同）—— 可能部署不完整或被改过${OFF}`);
  console.log(`\n${DIM}提示：本地 dist 是刚构建的，线上需要重新部署才能一致${OFF}`);
  process.exitCode = 1;
}
