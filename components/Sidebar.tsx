import Link from "next/link";
import { Avatar } from "./Avatar";

const NAV = [
  { href: "/", label: "文章" },
  { href: "/shuoshuo", label: "说说" },
  { href: "/archives", label: "归档" },
  { href: "/friend-links", label: "友链" },
  { href: "/about", label: "关于" },
];

/** 桌面端左侧栏（手机端整块隐藏，改用 MobileNav 抽屉） */
export function Sidebar({ active }: { active?: string }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Avatar />
        <div>
          <div className="brand-name">flechazo</div>
          <div className="brand-tagline">记录 AI、开发与折腾的日常</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={active === n.href ? "active" : ""}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <a href="/rss.xml">RSS</a>
        <a href="/admin" title="管理后台">管理</a>
      </div>
    </aside>
  );
}
