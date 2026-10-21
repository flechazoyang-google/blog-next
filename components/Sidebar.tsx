import Link from "next/link";
import { SearchBox } from "./SearchBox";

const NAV = [
  { href: "/", label: "文章", icon: "📄" },
  { href: "/shuoshuo", label: "说说", icon: "💬" },
  { href: "/archives", label: "归档", icon: "🗂" },
  { href: "/friend-links", label: "友链", icon: "🔗" },
  { href: "/about", label: "关于", icon: "👤" },
];

/** 桌面端左侧栏 —— 参照 xaoxuu.com：居中大头像 + 衬线站名 + 虚线搜索框 + 图标导航 */
export function Sidebar({ active }: { active?: string }) {
  return (
    <aside className="sidebar">
      {/* 品牌区：居中大头像 + 名字 + 标语 */}
      <Link href="/" className="brand-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/avatar.jpg" alt="flechazo" className="brand-photo" />
        <div className="brand-title">flechazo</div>
        <div className="brand-desc">记录 AI、开发与折腾的日常</div>
      </Link>

      {/* 虚线边框的搜索框 */}
      <SearchBox variant="dashed" />

      {/* 图标导航 */}
      <nav className="nav">
        {NAV.map((n) => {
          const isActive = active === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={"nav-item" + (isActive ? " is-active" : "")}
            >
              <span className="nav-ico">{n.icon}</span>
              <span className="nav-txt">{n.label}</span>
              {isActive ? <span className="nav-dot" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="side-bottom">
        <a href="/rss.xml" title="RSS">RSS</a>
        <a href="/admin" title="管理后台">设置</a>
      </div>
    </aside>
  );
}
