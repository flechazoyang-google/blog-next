import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommentActions } from "@/components/admin/CommentActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "后台" };

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const db = getDb();
  const posts = db.prepare(
    "SELECT id,type,title,slug,status,published_at,updated_at FROM posts ORDER BY COALESCE(published_at,updated_at) DESC"
  ).all() as any[];

  const pending = db.prepare(
    `SELECT c.*, p.title as post_title, p.slug as post_slug FROM comments c
     JOIN posts p ON c.post_id=p.id WHERE c.status='pending' ORDER BY c.created_at DESC LIMIT 50`
  ).all() as any[];

  const stats = {
    total: posts.filter((p) => p.type === "post").length,
    drafts: posts.filter((p) => p.status === "draft").length,
    shuoshuo: posts.filter((p) => p.type === "shuoshuo").length,
    pending: pending.length,
  };

  return (
    <AdminShell active="posts" username={user.username}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 32 }}>
        <Stat label="文章" value={stats.total} />
        <Stat label="草稿" value={stats.drafts} />
        <Stat label="说说" value={stats.shuoshuo} />
        <Stat label="待审评论" value={stats.pending} highlight={stats.pending > 0} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", color: "var(--text-p0)", margin: 0 }}>内容</h2>
        <Link href="/admin/new" className="btn btn-primary btn-sm">新建文章</Link>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--card-bg)" }}>
        {posts.length === 0 ? <div className="empty">还没有内容</div> : posts.map((p) => (
          <Link key={p.id} href={`/admin/edit/${p.id}`} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
            borderBottom: "1px solid var(--border)", color: "inherit",
          }}>
            <span style={{
              fontSize: ".7rem", padding: "1px 7px", borderRadius: 999,
              border: "1px solid var(--border)", color: "var(--text-p3)", flexShrink: 0,
            }}>{p.type === "post" ? "文章" : p.type === "page" ? "页面" : "说说"}</span>
            <span style={{ flex: 1, fontSize: ".9rem", color: "var(--text-p0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.title || "(无标题)"}
            </span>
            <span style={{ fontSize: ".75rem", color: "var(--text-p4)", flexShrink: 0 }}>
              {p.status === "draft" ? "草稿" : (p.published_at || "").slice(0, 10)}
            </span>
          </Link>
        ))}
      </div>

      {pending.length > 0 ? (
        <>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", color: "var(--text-p0)", margin: "36px 0 16px" }}>
            待审核评论
          </h2>
          <PendingComments items={pending} />
        </>
      ) : null}
    </AdminShell>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{
      padding: "16px 18px", border: "1px solid var(--border)", borderRadius: 14,
      background: "var(--card-bg)",
    }}>
      <div style={{ fontSize: ".75rem", color: "var(--text-p4)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 650, color: highlight ? "var(--link)" : "var(--text-p0)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function PendingComments({ items }: { items: any[] }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)" }}>
      {items.map((c) => (
        <div key={c.id} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: ".8rem", color: "var(--text-p3)", marginBottom: 6 }}>
            <strong style={{ color: "var(--text-p0)" }}>{c.author}</strong>
            {" · "}{c.post_title}{" · "}{c.created_at.slice(0, 16)}
          </div>
          <div style={{ fontSize: ".88rem", color: "var(--text-p2)", marginBottom: 10 }}>{c.content}</div>
          <CommentActions id={c.id} />
        </div>
      ))}
    </div>
  );
}

