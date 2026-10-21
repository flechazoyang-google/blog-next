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

const UMAMI = process.env.NEXT_PUBLIC_UMAMI_SRC;
const umamiOrigin = (() => {
  if (!UMAMI) return "";
  try {
    return new URL(UMAMI).origin;
  } catch {
    return "";
  }
})();

function csp(extra: { scriptSrc?: string[]; styleSrc?: string[] } = {}) {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(umamiOrigin ? [umamiOrigin] : []), ...(extra.scriptSrc ?? [])];
  const styleSrc = ["'self'", "'unsafe-inline'", ...(extra.styleSrc ?? [])];
  const connectSrc = ["'self'", ...(umamiOrigin ? [umamiOrigin] : [])];
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

const cspHeader = CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

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
          { key: cspHeader, value: csp() },
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
        headers: [...baseSecurityHeaders, { key: cspHeader, value: csp() }],
      },
    ];
  },
};

export default nextConfig;
