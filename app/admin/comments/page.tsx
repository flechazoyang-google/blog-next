import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommentActions } from "@/components/admin/CommentActions";
import { formatIn } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "评论" };

export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const sp = await searchParams;
  const status = sp.status ?? "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const PAGE = 50;

  const db = getDb();
  const where = status ? "WHERE c.status = ?" : "";
  const args = status ? [status] : [];
  const total = (db.prepare("SELECT COUNT(*) c FROM comments c " + where).get(...args) as { c: number }).c;

  const rows = db.prepare(
    "SELECT c.*, p.title as post_title, p.slug as post_slug FROM comments c JOIN posts p ON c.post_id = p.id " +
    where + " ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, c.created_at DESC " +
    "LIMIT ? OFFSET ?"
  ).all(...args, PAGE, (page - 1) * PAGE) as {
    id: number; author: string; email: string; url: string; content: string; status: string;
    created_at: string; ip: string; parent_id: number | null; post_title: string; post_slug: string;
  }[];

  const byId = new Map(rows.map((r) => [r.id, r]));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const tab = (k: string, label: string) => (
    <a key={k} className="btn btn-sm" href={k ? "/admin/comments?status=" + k : "/admin/comments"}
       style={{ opacity: status === k ? 1 : .6, fontWeight: status === k ? 600 : 400 }}>{label}</a>
  );

  return (
    <AdminShell active="comments" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 6px" }}>
        评论管理
      </h1>
      <p style={{ fontSize: ".82rem", color: "var(--text-p4)", margin: "0 0 16px" }}>共 {total} 条</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {tab("", "全部")}{tab("pending", "待审核")}{tab("approved", "已通过")}{tab("spam", "垃圾")}
      </div>

      {rows.length === 0 ? <div className="empty">没有评论</div> : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)" }}>
          {rows.map((c) => {
            const parent = c.parent_id ? byId.get(c.parent_id) : null;
            return (
              <div key={c.id} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: ".8rem", color: "var(--text-p3)", marginBottom: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--text-p0)" }}>{c.author}</strong>
                  <span>· {c.post_title}</span>
                  <span>· {formatIn(c.created_at, "datetime")}</span>
                  <span style={{ color: "var(--text-p4)" }}>· {c.ip}</span>
                  {parent ? <span style={{ color: "var(--link)" }}>· 回复 {parent.author}</span> : null}
                </div>
                {parent ? (
                  <div style={{
                    fontSize: ".78rem", color: "var(--text-p4)", borderLeft: "2px solid var(--border)",
                    paddingLeft: 10, marginBottom: 6,
                  }}>{parent.content.slice(0, 100)}</div>
                ) : null}
                <div style={{ fontSize: ".88rem", color: "var(--text-p2)", marginBottom: 10, whiteSpace: "pre-wrap" }}>{c.content}</div>
                <CommentActions id={c.id} currentStatus={c.status} />
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="pager" style={{ marginTop: 16 }}>
          {page > 1 ? <a className="btn btn-sm" href={"/admin/comments?status=" + status + "&page=" + (page - 1)}>上一页</a> : null}
          <span className="btn btn-sm" style={{ pointerEvents: "none", opacity: .6 }}>{page} / {pages}</span>
          {page < pages ? <a className="btn btn-sm" href={"/admin/comments?status=" + status + "&page=" + (page + 1)}>下一页</a> : null}
        </div>
      ) : null}
    </AdminShell>
  );
}
