import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  images: { unoptimized: true },
  experimental: {
    // 由浏览器原生处理前进/后退的滚动位置，避免 Next 的 scroll 恢复与应用渲染打架造成的跳动
    scrollRestoration: false,
  },
};

export default nextConfig;
