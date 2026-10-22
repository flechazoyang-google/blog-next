import fs from "node:fs";
import path from "node:path";

/**
 * 构建版本信息（由 scripts/stamp-version.mjs 在打包时写入 dist/.build-info.json）。
 *
 * 目的只有一个：让"线上跑的是哪次提交"能从外部查证。
 * 此前 healthz 只报数据库状态，同一 schema 下换十次前端代码返回值完全一样，
 * 部署是否生效只能人肉上服务器 md5 比对。
 *
 * 读取失败必须静默降级 —— 这只是诊断信息，绝不能因为缺文件让 healthz 500。
 */
export type BuildInfo = {
  commit: string | null;
  shortCommit: string;
  branch: string;
  dirty: boolean;
  reproducible: boolean;
  builtAt: string;
};

let cached: BuildInfo | null | undefined;

export function getBuildInfo(): BuildInfo | null {
  if (cached !== undefined) return cached;

  // standalone 运行时 cwd 可能是 /opt/blog，也可能是 .next/standalone
  const candidates = [
    path.join(process.cwd(), ".build-info.json"),
    path.join(process.cwd(), "..", ".build-info.json"),
    path.join(process.cwd(), "..", "..", ".build-info.json"),
  ];

  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw) as Partial<BuildInfo>;
      if (!parsed || typeof parsed.shortCommit !== "string") continue;
      cached = {
        commit: parsed.commit ?? null,
        shortCommit: parsed.shortCommit,
        branch: parsed.branch ?? "unknown",
        dirty: Boolean(parsed.dirty),
        reproducible: Boolean(parsed.reproducible),
        builtAt: parsed.builtAt ?? "",
      };
      return cached;
    } catch {
      // 换下一个候选路径
    }
  }

  cached = null;
  return null;
}
