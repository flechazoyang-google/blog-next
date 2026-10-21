import Link from "next/link";
import { Avatar } from "./Avatar";

// primary: 手机端也显示；optional: 手机端收进底部那一行
const NAV = [
  { href: "/", label: "文章", primary: true },
  { href: "/shuoshuo", label: "说说", primary: true },
  { href: "/archives", label: "归档", primary: true },
  { href: "/about", label: "关于", primary: false },
  { href: "/friend-links", label: "友链", primary: false },
];

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
          <Link
            key={n.href}
            href={n.href}
            className={`${active === n.href ? "active" : ""} ${n.primary ? "" : "nav-optional"}`.trim()}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <Link href="/about" className="only-mobile">关于</Link>
        <Link href="/friend-links" className="only-mobile">友链</Link>
        <a href="/rss.xml">RSS</a>
        <a href="/admin" title="管理后台">管理</a>
      </div>
    </aside>
  );
}
