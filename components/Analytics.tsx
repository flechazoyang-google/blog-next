"use client";
import Script from "next/script";

/**
 * Umami 统计脚本。
 * 通过环境变量启用，未配置时完全不输出（避免开发环境报错）。
 *   NEXT_PUBLIC_UMAMI_SRC  例如 https://umami.yghsite.cn/script.js
 *   NEXT_PUBLIC_UMAMI_ID   Umami 里新建站点后得到的 Website ID
 */
export function Analytics() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const id = process.env.NEXT_PUBLIC_UMAMI_ID;
  if (!src || !id) return null;

  return (
    <Script
      src={src}
      data-website-id={id}
      strategy="afterInteractive"
      defer
    />
  );
}
