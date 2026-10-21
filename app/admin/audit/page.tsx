import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { listAudit } from "@/lib/audit";
import { formatIn } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "操作日志" };

const PAGE_SIZE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; action?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const q = (sp.q ?? "").trim();
  const action = (sp.action ?? "").trim();

  const { rows, total } = listAudit({ q, action, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell active="audit" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 6px" }}>
        操作日志
      </h1>
      <p style={{ fontSize: ".82rem", color: "var(--text-p4)", margin: "0 0 18px" }}>
        共 {total} 条。这是此前完全缺失的能力 —— 出了问题只能靠猜。
      </p>

      <form method="get" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="input" name="q" defaultValue={q} placeholder="搜索操作人 / 动作 / 详情" style={{ maxWidth: 280, padding: "6px 10px" }} />
        <input className="input" name="action" defaultValue={action} placeholder="动作，如 post.delete" style={{ maxWidth: 200, padding: "6px 10px" }} />
        <button className="btn btn-sm" type="submit">筛选</button>
        {q || action ? <Link className="btn btn-sm" href="/admin/audit">清除</Link> : null}
      </form>

      {rows.length === 0 ? <div className="empty">没有记录</div> : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--card-bg)" }}>
          {rows.map((r) => (
            <div key={r.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: ".8rem" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-p2)" }}>{r.action}</span>
                <span style={{ color: "var(--text-p3)" }}>{r.actor_name || "-"}</span>
                {r.target_type ? <span style={{ color: "var(--text-p4)", fontSize: ".74rem" }}>{r.target_type} #{r.target_id}</span> : null}
                <span style={{ flex: 1 }} />
                <span style={{ color: "var(--text-p4)", fontSize: ".74rem" }}>{r.ip}</span>
                <span style={{ color: "var(--text-p4)", fontSize: ".74rem" }}>{formatIn(r.created_at, "datetime")}</span>
              </div>
              {r.meta_json && r.meta_json !== "{}" ? (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", color: "var(--text-p4)", marginTop: 4, wordBreak: "break-all" }}>
                  {r.meta_json.slice(0, 220)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="pager" style={{ marginTop: 16 }}>
          {page > 1 ? <Link className="btn btn-sm" href={"/admin/audit?page=" + (page - 1) + "&q=" + encodeURIComponent(q)}>上一页</Link> : null}
          <span className="btn btn-sm" style={{ pointerEvents: "none", opacity: .6 }}>{page} / {pages}</span>
          {page < pages ? <Link className="btn btn-sm" href={"/admin/audit?page=" + (page + 1) + "&q=" + encodeURIComponent(q)}>下一页</Link> : null}
        </div>
      ) : null}
    </AdminShell>
  );
}
