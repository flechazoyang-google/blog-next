"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "首页", icon: "🏠" },
  { href: "/archives", label: "归档", icon: "📚" },
  { href: "/shuoshuo", label: "说说", icon: "💬" },
  { href: "/friend-links", label: "朋友", icon: "🎯" },
  { href: "/about", label: "关于", icon: "👤" },
];

/**
 * 手机端顶部栏：左侧 Logo + 站名，右侧一个汉堡按钮。
 * 导航全部收进左侧抽屉，避免顶部横向排列拥挤。
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [kw, setKw] = useState("");

  // 切换路由时自动关闭
  useEffect(() => { setOpen(false); }, [pathname]);

  // 打开时锁定背景滚动
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {searching ? (
        <header className="mobile-topbar mobile-searchbar">
          <form
            className="mobile-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              const q = kw.trim();
              if (q) {
                router.push("/search?q=" + encodeURIComponent(q));
                setSearching(false);
              }
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="msi">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              type="search"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索文章…"
              aria-label="搜索文章"
            />
            <button type="button" aria-label="取消" onClick={() => { setSearching(false); setKw(""); }}>
              取消
            </button>
          </form>
        </header>
      ) : (
      <header className="mobile-topbar">
        <Link href="/" className="mobile-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/avatar.jpg" alt="" width={28} height={28} onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }} />
          <span>flechazo</span>
        </Link>
        <div className="mobile-topbar-actions">
          <button className="mobile-icon-btn" aria-label="搜索" onClick={() => setSearching(true)}>
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden>
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="mobile-menu-btn"
            aria-label="菜单"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>
      )}

      {open ? (
        <div className="mobile-drawer-mask" onClick={() => setOpen(false)}>
          <nav className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-head">
              <span>导航</span>
              <button aria-label="关闭" onClick={() => setOpen(false)}>×</button>
            </div>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={"mobile-drawer-item" + (pathname === n.href ? " active" : "")}
              >
                <span className="mi">{n.icon}</span>
                {n.label}
              </Link>
            ))}
            <div className="mobile-drawer-foot">
              <a href="/rss.xml">RSS</a>
              <a href="/admin">管理</a>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
