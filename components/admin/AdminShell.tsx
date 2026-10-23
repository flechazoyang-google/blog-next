import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

const NAV = [
  { href: "/admin", label: "内容", key: "posts" },
  { href: "/admin/new", label: "写文章", key: "new" },
  { href: "/admin/comments", label: "评论", key: "comments" },
  { href: "/admin/media", label: "图片", key: "media" },
  { href: "/admin/links", label: "外链", key: "links" },
  { href: "/admin/audit", label: "日志", key: "audit" },
  { href: "/admin/settings", label: "设置", key: "settings" },
];

export function AdminShell({ children, active, username }: {
  children: React.ReactNode; active: string; username: string;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-subtle)" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg)", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{
          maxWidth: 880, margin: "0 auto", padding: "12px 20px",
          display: "flex", alignItems: "center", gap: 20,
        }}>
          <Link href="/" style={{
            fontFamily: "var(--font-serif)", fontWeight: 650, fontSize: "1rem",
            color: "var(--text-p0)",
          }}>flechazo</Link>
          <nav style={{ display: "flex", gap: 4, flex: 1, overflowX: "auto" }}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} style={{
                padding: "5px 11px", borderRadius: 8, fontSize: ".875rem", whiteSpace: "nowrap",
                color: active === n.key ? "var(--text-p0)" : "var(--text-p3)",
                background: active === n.key ? "var(--bg-subtle)" : "transparent",
                fontWeight: active === n.key ? 600 : 400,
              }}>{n.label}</Link>
            ))}
          </nav>
          <LogoutButton username={username} />
        </div>
      </header>
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 80px" }}>
        {children}
      </main>
    </div>
  );
}
