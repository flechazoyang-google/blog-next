import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

// node --test 的解析钩子：让测试能加载 Next 风格的 import。
//   1) "@/lib/x"                 -> <root>/lib/x(.ts)
//   2) 相对路径且无扩展名        -> 补 .ts / .tsx / /index.ts
// Next 自身有这些能力，生产构建不需要这个钩子，仅测试使用。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANDIDATE_EXTS = [".ts", ".tsx", ".mjs", ".js"];

function firstExisting(base) {
  for (const e of CANDIDATE_EXTS) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const e of CANDIDATE_EXTS) {
      const idx = path.join(base, "index" + e);
      if (fs.existsSync(idx)) return idx;
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    let target = null;
    if (specifier.startsWith("@/")) {
      target = firstExisting(path.join(ROOT, specifier.slice(2)));
    } else if (specifier.startsWith(".")) {
      const parentDir = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : ROOT;
      target = firstExisting(path.resolve(parentDir, specifier));
    }
    if (!target) throw err;
    // 交回默认解析，让 Node 自己决定 format（类型剥离需要它）
    return next(pathToFileURL(target).href, { ...context, parentURL: context.parentURL });
  }
}
