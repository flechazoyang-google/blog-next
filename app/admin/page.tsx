import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommentActions } from "@/components/admin/CommentActions";
import { PostList } from "@/components/admin/PostList";
import { formatIn } from "@/lib/time";
import { dateKeyIn } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "后台" };

const PAGE_SIZE = 20;

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<{ page?: string; q?: string; type?: string; status?: string; trash?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const q = (sp.q ?? "").trim();
  const type = sp.type ?? "";
  const status = sp.status ?? "";
  const trash = sp.trash === "1";

  const db = getDb();
  const stats = (() => {
    const c = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
    return {
      total: c("SELECT COUNT(*) c FROM posts WHERE type='post' AND deleted_at IS NULL"),
      drafts: c("SELECT COUNT(*) c FROM posts WHERE status='draft' AND deleted_at IS NULL"),
      shuoshuo: c("SELECT COUNT(*) c FROM posts WHERE type='shuoshuo' AND deleted_at IS NULL"),
      trash: c("SELECT COUNT(*) c FROM posts WHERE deleted_at IS NOT NULL"),
      pending: c("SELECT COUNT(*) c FROM comments WHERE status='pending'"),
    };
  })();

  const where: string[] = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
  const args: unknown[] = [];
  if (["post", "page", "shuoshuo"].includes(type)) { where.push("type = ?"); args.push(type); }
  if (["draft", "published"].includes(status)) { where.push("status = ?"); args.push(status); }
  if (q) { where.push("(title LIKE ? OR slug LIKE ?)"); args.push("%" + q + "%", "%" + q + "%"); }
  const whereSql = "WHERE " + where.join(" AND ");

  const total = (db.prepare("SELECT COUNT(*) c FROM posts " + whereSql).get(...args) as { c: number }).c;
  const rows = db.prepare(
    "SELECT id, type, title, slug, status, published_at, updated_at FROM posts " + whereSql +
    " ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ? OFFSET ?"
  ).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as {
    id: number; type: string; title: string; slug: string; status: string;
    published_at: string | null; updated_at: string;
  }[];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pending = db.prepare(
    "SELECT c.*, p.title as post_title FROM comments c JOIN posts p ON c.post_id = p.id " +
    "WHERE c.status = 'pending' ORDER BY c.created_at DESC LIMIT 20"
  ).all() as { id: number; author: string; content: string; created_at: string; post_title: string }[];

  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ page: String(page), q, type, status });
    if (trash) u.set("trash", "1");
    for (const [k, v] of Object.entries(extra)) { if (v) u.set(k, v); else u.delete(k); }
    return "/admin?" + u.toString();
  };

  return (
    <AdminShell active="posts" username={user.username}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginBottom: 26 }}>
        <Stat label="文章" value={stats.total} />
        <Stat label="草稿" value={stats.drafts} />
        <Stat label="说说" value={stats.shuoshuo} />
        <Stat label="待审评论" value={stats.pending} highlight={stats.pending > 0} href="/admin/comments" />
        <Stat label="回收站" value={stats.trash} href="/admin?trash=1" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", color: "var(--text-p0)", margin: 0 }}>
          {trash ? "回收站" : "内容"}
          <span style={{ fontSize: ".74rem", color: "var(--text-p4)", marginLeft: 8, fontWeight: 400 }}>{total} 条</span>
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!trash ? <Link href="/admin/new" className="btn btn-primary btn-sm">新建文章</Link> : null}
          <Link href={trash ? "/admin" : "/admin?trash=1"} className="btn btn-sm">
            {trash ? "← 回到内容" : "回收站"}
          </Link>
        </div>
      </div>

      <form method="get" action="/admin" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {trash ? <input type="hidden" name="trash" value="1" /> : null}
        <input className="input" name="q" defaultValue={q} placeholder="搜索标题 / URL" style={{ maxWidth: 240, padding: "6px 10px" }} />
        <select className="input" name="type" defaultValue={type} style={{ maxWidth: 110, padding: "6px 10px" }}>
          <option value="">全部类型</option>
          <option value="post">文章</option>
          <option value="page">页面</option>
          <option value="shuoshuo">说说</option>
        </select>
        <select className="input" name="status" defaultValue={status} style={{ maxWidth: 110, padding: "6px 10px" }}>
          <option value="">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
        </select>
        <button className="btn btn-sm" type="submit">筛选</button>
        {q || type || status ? <Link className="btn btn-sm" href={trash ? "/admin?trash=1" : "/admin"}>清除</Link> : null}
      </form>

      <PostList
        items={rows.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          status: r.status,
          dateLabel: r.status === "published" && r.published_at ? dateKeyIn(r.published_at) : "草稿",
        }))}
        trash={trash}
        stepUpRequired={!!user.totp_enabled}
      />

      {pages > 1 ? (
        <div className="pager" style={{ marginTop: 16 }}>
          {page > 1 ? <Link className="btn btn-sm" href={qs({ page: String(page - 1) })}>上一页</Link> : null}
          <span className="btn btn-sm" style={{ pointerEvents: "none", opacity: .6 }}>{page} / {pages}</span>
          {page < pages ? <Link className="btn btn-sm" href={qs({ page: String(page + 1) })}>下一页</Link> : null}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", color: "var(--text-p0)", margin: "36px 0 16px" }}>
            待审核评论
          </h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)" }}>
            {pending.map((c) => (
              <div key={c.id} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: ".8rem", color: "var(--text-p3)", marginBottom: 6 }}>
                  <strong style={{ color: "var(--text-p0)" }}>{c.author}</strong>
                  {" · "}{c.post_title}{" · "}{formatIn(c.created_at, "datetime")}
                </div>
                <div style={{ fontSize: ".88rem", color: "var(--text-p2)", marginBottom: 10 }}>{c.content}</div>
                <CommentActions id={c.id} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}

function Stat({ label, value, highlight, href }: { label: string; value: number; highlight?: boolean; href?: string }) {
  const inner = (
    <div style={{
      padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 14,
      background: "var(--card-bg)",
    }}>
      <div style={{ fontSize: ".75rem", color: "var(--text-p4)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 650, color: highlight ? "var(--link)" : "var(--text-p0)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ color: "inherit" }}>{inner}</Link> : inner;
}
