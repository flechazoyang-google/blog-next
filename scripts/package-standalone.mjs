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

/**
 * 递归删除。两个必须绕开的坑：
 *
 * 1) Windows 上遇到只读文件会 EPERM，而 public/ 里就有 444 的文件
 *    （历史上被手工改成只读，git 也保留了位）。
 * 2) **Node 24 在 Windows 上，fs.rmSync 删除某些中文文件名会直接让进程
 *    崩溃（0xC0000409），try/catch 完全接不住** —— 实测 "做.md" 必崩，
 *    而 "中文.md" 正常。这不是权限问题，换个目录、换台机器症状一致。
 *    改用 unlinkSync + rmdirSync 手动递归则一切正常。
 *
 * dist/ 里含大量中文文件名（out/posts/*.md），所以这里绝不能用 rmSync。
 */
function forceRemove(target) {
  if (!fs.existsSync(target)) return;
  const st = fs.lstatSync(target);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(target)) forceRemove(path.join(target, e));
    try { fs.chmodSync(target, 0o666); } catch { /* 已经可写 */ }
    fs.rmdirSync(target);
    return;
  }
  try { fs.chmodSync(target, 0o666); } catch { /* 已经可写 */ }
  fs.unlinkSync(target);
}

forceRemove(OUT);
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
    else {
      // 目标可能是上次留下的只读文件，先解锁再覆盖
      if (fs.existsSync(d)) { try { fs.chmodSync(d, 0o666); } catch { /* ignore */ } }
      fs.copyFileSync(s, d);
    }
  }
}

copyDir(STANDALONE, OUT);
copyDir(path.join(ROOT, ".next", "static"), path.join(OUT, ".next", "static"));
if (fs.existsSync(path.join(ROOT, "public"))) copyDir(path.join(ROOT, "public"), path.join(OUT, "public"));
copyDir(path.join(ROOT, "scripts"), path.join(OUT, "scripts"));
if (fs.existsSync(path.join(ROOT, "content"))) copyDir(path.join(ROOT, "content"), path.join(OUT, "content"));
if (fs.existsSync(path.join(ROOT, "deploy"))) copyDir(path.join(ROOT, "deploy"), path.join(OUT, "deploy"));

/**
 * C3：standalone 只追踪 Next 自己能静态分析的依赖。
 * bcryptjs / otpauth / marked / gray-matter 这类通过运行时 require 或动态路径引入的
 * 依赖不会被 trace 进来 —— 这正是 README 要求「在服务器上 npm install --no-save」
 * 的原因，而那个步骤一旦漏掉就是 500。
 *
 * 这里把 package.json 的 dependencies 全部从本地 node_modules 补进产物，
 * 让部署不再需要服务器联网装包。
 */
function copyRuntimeDeps() {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = Object.keys(pkg.dependencies || {});
  const src = path.join(ROOT, "node_modules");
  const dst = path.join(OUT, "node_modules");
  let copied = 0;
  const missing = [];

  // 递归收集依赖的依赖，避免只拷一级导致运行时缺包
  const seen = new Set();
  function walk(name) {
    if (seen.has(name)) return;
    seen.add(name);
    const from = path.join(src, name);
    if (!fs.existsSync(from)) { missing.push(name); return; }
    const to = path.join(dst, name);
    if (!fs.existsSync(to)) { copyDir(from, to); copied++; }
    let meta;
    try { meta = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8")); } catch { return; }
    for (const dep of Object.keys(meta.dependencies || {})) walk(dep);
    for (const dep of Object.keys(meta.optionalDependencies || {})) walk(dep);
  }
  for (const d of deps) walk(d);
  if (missing.length) console.warn("!! 缺少依赖（未安装）：", missing.join(", "));
  console.log("运行时依赖已补入产物：", copied, "个包");
}

copyRuntimeDeps();

/**
 * 打版本戳：产出 dist/.build-info.json，供运行期 healthz 读取。
 * 顺序无所谓（读的是 git 状态而非产物），放最后让日志更清楚。
 */
const { execFileSync } = await import("node:child_process");
try {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "stamp-version.mjs")], {
    cwd: ROOT, stdio: "inherit",
  });
} catch {
  console.warn("!! 版本戳写入失败，healthz 的 commit 将为 null");
}

console.log("dist ready:", OUT);
