"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();

  // 切换路由时自动关闭
  useEffect(() => { setOpen(false); }, [pathname]);

  // 打开时锁定背景滚动
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="mobile-topbar">
        <Link href="/" className="mobile-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/avatar.png" alt="" width={28} height={28} onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }} />
          <span>flechazo</span>
        </Link>
        <button
          className="mobile-menu-btn"
          aria-label="菜单"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span /><span /><span />
        </button>
      </header>

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
