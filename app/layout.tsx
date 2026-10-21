import type { Metadata } from "next";
import "./globals.css";
import { ScrollReset } from "@/components/ScrollReset";
import { MobileNav } from "@/components/MobileNav";

export const metadata: Metadata = {
  title: { default: "flechazo's blog", template: "%s · flechazo" },
  description: "记录 AI、开发与折腾的日常。",
  metadataBase: new URL("https://blog.yghsite.cn"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <ScrollReset />
        <MobileNav />
        {children}
      </body>
    </html>
  );
}
