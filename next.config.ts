import type { NextConfig } from "next";

/**
 * 安全响应头（方案 A2）。
 *
 * 背景：全站此前**没有任何**安全头 —— 一处上传型 XSS 就能带着管理员 Cookie
 * 打同源请求。这里补齐基础头，并给 CSP 分两档。
 *
 * CSP 的落地策略（重要）：
 *   全站在 JSX 里大量使用内联 style 属性（AdminShell、RightBar、动态分类色…），
 *   直接下发强 CSP 会让界面大面积失效。因此默认只发 **Report-Only**，
 *   观察几天确认没有新的违规再切 enforce：把 CSP_MODE 设成 "enforce" 即可。
 */
const CSP_MODE = process.env.CSP_MODE === "enforce" ? "enforce" : "report-only";

/**
 * 统计脚本的源。
 *
 * 坑点：next.config.ts 是在**构建期**求值的，而 NEXT_PUBLIC_UMAMI_SRC 是
 * systemd 在运行期注入的 —— 构建机上根本没有这个变量，于是 CSP 里漏掉了
 * umami 的源，一旦把 CSP 从 Report-Only 切成 enforce，统计上报会被直接拦掉。
 *
 * 这里有两条路：
 *   a) 构建时注入（要求构建机也配同一组环境变量，容易忘）
 *   b) 给一个**默认值**兜住，再用环境变量覆盖（本次采用）
 * 选 b，因为统计域名是固定的，忘配也不会静默失效。
 */
const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC || "https://umami.yghsite.cn/script.js";

function originOf(src: string): string {
  try {
    return new URL(src).origin;
  } catch {
    return "";
  }
}

// 构建期拿不到环境变量时，至少把已知的统计域名放行，避免 enforce 后统计失效
const EXTRA_ORIGINS = (process.env.CSP_EXTRA_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const umamiOrigin = originOf(UMAMI_SRC);

/**
 * 评论系统（Artalk）的源。
 * 与 Umami 同理：构建期拿不到运行期环境变量，所以给默认值兜底。
 * 若漏了这里，CSP 一旦切 enforce，评论区的脚本/接口会被直接拦掉 ——
 * 而且不会报错，只会"评论区空白"，非常难查。
 */
const ARTALK_SRC = process.env.NEXT_PUBLIC_ARTALK_SRC || "https://artalk.yghsite.cn";
const artalkOrigin = originOf(ARTALK_SRC);

const allowedOrigins = [...new Set([umamiOrigin, artalkOrigin, ...EXTRA_ORIGINS].filter(Boolean))];

export function buildCsp(extra: { scriptSrc?: string[]; styleSrc?: string[] } = {}) {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...allowedOrigins, ...(extra.scriptSrc ?? [])];
  const styleSrc = ["'self'", "'unsafe-inline'", ...(extra.styleSrc ?? [])];
  const connectSrc = ["'self'", ...allowedOrigins];
  return [
    "default-src 'self'",
    "script-src " + scriptSrc.join(" "),
    "style-src " + styleSrc.join(" "),
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src " + connectSrc.join(" "),
    "media-src 'self' https:",
    // 文章里嵌了 bilibili 等播放器（hook.md 里有 iframe），需要放行 frame-src
    "frame-src 'self' https:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/**
 * 重要：next.config 的 headers() 在**构建期**求值并写进 routes-manifest.json，
 * 运行期改环境变量对它无效 —— 也就是说 CSP_MODE 这种开关放在这里是死代码。
 * 实测确认过：以 CSP_MODE=enforce 启动，响应头仍然是 Report-Only。
 *
 * 所以 CSP 交给 proxy.ts 在运行期下发（它每个请求都执行，能读到当时的 env）。
 * 这里只保留与 CSP 无关的静态安全头。
 */

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  images: { unoptimized: true },
  experimental: {
    // 由浏览器原生处理前进/后退的滚动位置，避免 Next 的 scroll 恢复与应用渲染打架造成的跳动
    scrollRestoration: false,
  },
  async headers() {
    return [
      {
        // 后台：更严的 CSP（禁 iframe、禁外链资源）+ 绝不缓存
        source: "/admin/:path*",
        headers: [
          ...baseSecurityHeaders,
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/admin/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        ],
      },
      {
        source: "/:path*",
        headers: [...baseSecurityHeaders,],
      },
    ];
  },
};

export default nextConfig;
