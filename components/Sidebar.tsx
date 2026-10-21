import Link from "next/link";
import { SearchBox } from "./SearchBox";

const NAV = [
  { href: "/", label: "文章" },
  { href: "/shuoshuo", label: "说说" },
  { href: "/archives", label: "归档" },
  { href: "/friend-links", label: "友链" },
  { href: "/about", label: "关于" },
];

/** 桌面端左侧栏：只有搜索 + 导航（手机端隐藏，改用 MobileNav） */
export function Sidebar({ active }: { active?: string }) {
  return (
    <aside className="sidebar">
      <SearchBox />
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
