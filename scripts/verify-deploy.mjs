#!/usr/bin/env node
/**
 * 版本一致性检查：本地 HEAD  vs  线上实际运行
 *
 * 用途：回答那个反复出问题的话 —— "线上跑的是不是我现在这份代码？"
 *
 * 判据来自 healthz 的 commit 字段（由 scripts/stamp-version.mjs 注入）。
 * 任何一台能 curl 的机器都能跑，不需要 SSH。
 *
 * 用法：
 *   node scripts/verify-deploy.mjs                     # 默认查线上
 *   node scripts/verify-deploy.mjs http://127.0.0.1:8090/api/healthz
 */
import { execFileSync } from "node:child_process";

const target = process.argv[2] || "https://blog.yghsite.cn/api/healthz";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", OFF = "\x1b[0m";

const localHead = git(["rev-parse", "HEAD"]);
const localShort = localHead ? localHead.slice(0, 7) : "unknown";
const dirty = git(["status", "--porcelain"]).length > 0;

let remote;
try {
  // connection: close —— 不留 keep-alive 连接，否则 Node 24 退出时会触发 libuv 断言
  const res = await fetch(target, {
    signal: AbortSignal.timeout(10000),
    headers: { connection: "close" },
  });
  remote = await res.json();
} catch (e) {
  console.error(`${RED}✗ 取不到 ${target}${OFF}\n  ${e.message}`);
  process.exit(2);
}

if (!remote.ok) {
  console.error(`${RED}✗ 健康检查失败${OFF}: ${remote.error ?? "unknown"}`);
  process.exit(2);
}

console.log(`目标  ${target}`);
console.log(`本地  ${localShort}${dirty ? YELLOW + " (工作区有未提交改动)" + OFF : ""}`);
console.log(`线上  ${remote.commit ?? "(未上报)"}`);

const problems = [];

if (remote.commit == null) {
  problems.push("线上 healthz 没有 commit 字段 —— 那个产物是加版本戳之前构建的，需要重新构建部署才能比对");
} else if (remote.commit !== localShort) {
  problems.push(`代码不一致：本地 ${localShort} ≠ 线上 ${remote.commit}`);
}

if (remote.reproducible === false) {
  problems.push("线上产物构建时有未提交改动，无法用 git 复现");
}

if (dirty) {
  problems.push("本地工作区有未提交改动 —— 即使 commit 相同，代码也可能不同");
}

console.log(`\n${DIM}schema ${remote.schema}  posts ${remote.posts}  comments ${remote.comments}${OFF}`);
console.log(`${DIM}构建于 ${remote.builtAt ?? "?"}${OFF}`);

if (problems.length === 0) {
  console.log(`\n${GREEN}✓ 本地与线上一致${OFF}`);
  process.exitCode = 0;
} else {
  console.log("");
  for (const p of problems) console.log(`${RED}✗ ${p}${OFF}`);
  process.exitCode = 1;
}
