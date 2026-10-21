import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommentActions } from "@/components/admin/CommentActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "评论" };

export default async function CommentsPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const rows = getDb().prepare(
    `SELECT c.*, p.title as post_title FROM comments c JOIN posts p ON c.post_id=p.id
     ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, c.created_at DESC LIMIT 200`
  ).all() as any[];

  const groups = {
    pending: rows.filter((r) => r.status === "pending"),
    approved: rows.filter((r) => r.status === "approved"),
    spam: rows.filter((r) => r.status === "spam"),
  };

  return (
    <AdminShell active="comments" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 20px" }}>
        评论管理
      </h1>
      {rows.length === 0 ? <div className="empty">还没有评论</div> : null}
      {(["pending", "approved", "spam"] as const).map((k) => groups[k].length > 0 ? (
        <section key={k} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: ".9rem", color: "var(--text-p3)", margin: "0 0 10px", fontWeight: 600 }}>
            {k === "pending" ? "待审核" : k === "approved" ? "已通过" : "垃圾"} ({groups[k].length})
          </h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)" }}>
            {groups[k].map((c) => (
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
        </section>
      ) : null)}
    </AdminShell>
  );
}
