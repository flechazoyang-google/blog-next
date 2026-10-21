import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ScrollReset } from "@/components/ScrollReset";
import { MobileNav } from "@/components/MobileNav";
import { Analytics } from "@/components/Analytics";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: { default: "flechazo's blog", template: "%s · flechazo" },
  description: "记录 AI、开发与折腾的日常。",
  metadataBase: new URL("https://blog.yghsite.cn"),
  manifest: "/manifest.webmanifest",
  applicationName: "flechazo's blog",
  appleWebApp: {
    capable: true,
    title: "flechazo",
    statusBarStyle: "default",
  },
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
