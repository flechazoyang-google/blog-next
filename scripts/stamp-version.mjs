#!/usr/bin/env node
/**
 * 给构建产物打版本戳，产出 dist/.build-info.json。
 *
 * 为什么需要：线上跑的是哪次提交，此前**无法从外部查证**。
 * healthz 只报数据库状态（schema/posts/comments），同一个 schema 下
 * 换十次前端代码，它返回的东西一模一样 —— 于是"部署到底生效没生效"
 * 只能靠人肉登录服务器 md5 比对。
 *
 * 有了这个文件，healthz 能直接报 commit，任何一台机器一条 curl 就能比对。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const commit = git(["rev-parse", "HEAD"]);
const short = commit ? commit.slice(0, 7) : "unknown";
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
// 有未提交改动 = 这个构建不对应任何提交，必须显式标出来
const dirty = git(["status", "--porcelain"]).length > 0;

const info = {
  commit: commit || null,
  shortCommit: short,
  branch,
  dirty,
  // 有未提交改动时，产物无法从 git 复现 —— 这是版本漂移最主要的来源之一
  reproducible: Boolean(commit) && !dirty,
  builtAt: new Date().toISOString(),
  builtBy: process.platform,
  nodeVersion: process.version,
};

const outPath = path.join(ROOT, "dist", ".build-info.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(info, null, 2) + "\n", "utf8");

console.log(`版本戳：${short}${dirty ? " (dirty)" : ""} @ ${branch}`);
if (dirty) {
  console.warn("!! 工作区有未提交改动：这个产物无法用 git 复现，建议先提交再构建");
}
