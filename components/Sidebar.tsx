import Link from "next/link";
import { Avatar } from "./Avatar";
import { SearchBox } from "./SearchBox";
import { getSiteStats, getTagCloud } from "@/lib/site-stats";

const NAV = [
  { href: "/", label: "文章" },
  { href: "/shuoshuo", label: "说说" },
  { href: "/archives", label: "归档" },
  { href: "/friend-links", label: "友链" },
  { href: "/about", label: "关于" },
];

/** 桌面端左侧栏（手机端整块隐藏，改用 MobileNav 抽屉） */
export function Sidebar({ active }: { active?: string }) {
  const stats = getSiteStats();
  const tags = getTagCloud();

  return (
    <aside className="sidebar">
      <div className="brand">
        <Avatar />
        <div>
          <div className="brand-name">flechazo</div>
          <div className="brand-tagline">记录 AI、开发与折腾的日常</div>
        </div>
      </div>

      <SearchBox />

      <nav className="nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={active === n.href ? "active" : ""}>
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-stats">
        {stats.map((s) => (
          <div key={s.label} className="sidebar-stat">
            <b>{s.value}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {tags.length > 0 ? (
        <div className="tag-cloud">
          <div className="tag-cloud-title">标签</div>
          <div className="tag-cloud-items">
            {tags.map((t) => (
              <Link
                key={t.name}
                href={"/tags/" + encodeURIComponent(t.name)}
                className="tag-cloud-item"
                style={{ fontSize: t.size + "rem" }}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sidebar-footer">
        <a href="/rss.xml">RSS</a>
        <a href="/admin" title="管理后台">管理</a>
      </div>
    </aside>
  );
}
