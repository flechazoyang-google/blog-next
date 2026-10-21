import Link from "next/link";

const NAV = [
  { href: "/", label: "文章" },
  { href: "/shuoshuo", label: "说说" },
  { href: "/archives", label: "归档" },
  { href: "/about", label: "关于" },
];

export function Sidebar({ active }: { active?: string }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-avatar">F</div>
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
      </div>
    </aside>
  );
}
