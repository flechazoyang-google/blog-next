import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ScrollReset } from "@/components/ScrollReset";
import { MobileNav } from "@/components/MobileNav";
import { Analytics } from "@/components/Analytics";
import { PwaRegister } from "@/components/PwaRegister";
import { getSettings } from "@/lib/settings";

/**
 * C4：站名/描述此前硬编码在这里，改一个字要重新构建。
 * 现在从 settings 表读（进程内缓存，写即失效）。
 */
export async function generateMetadata(): Promise<Metadata> {
  const s = getSettings();
  return {
    title: { default: s.siteTitle, template: "%s · " + s.author },
    description: s.siteDescription,
    metadataBase: new URL(process.env.SITE_URL || "https://blog.yghsite.cn"),
    manifest: "/manifest.webmanifest",
    applicationName: s.siteTitle,
    openGraph: {
      type: "website",
      siteName: s.siteTitle,
      title: s.siteTitle,
      description: s.siteDescription,
      locale: "zh_CN",
    },
    twitter: {
      card: "summary_large_image",
      title: s.siteTitle,
      description: s.siteDescription,
    },
    appleWebApp: { capable: true, title: s.author, statusBarStyle: "default" },
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#fffefc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <ScrollReset />
        <MobileNav />
        {children}
        <Analytics />
        <PwaRegister />
      </body>
    </html>
  );
}
