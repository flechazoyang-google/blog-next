import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { RightBar } from "@/components/RightBar";
import { listArchives } from "@/lib/posts";
import { dateKeyIn } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "归档" };

/**
 * B4：原实现按年分组（published_at.slice(0,4)）却把变量命名为 ym，
 * 月度维度整体丢失。现在按 年 -> 月 两级展示，且日期按展示时区计算。
 */
export default function ArchivesPage() {
  const groups = listArchives();
  return (
    <>
      <Animations />
      <div className="site-shell">
        <Sidebar active="/archives" />
        <main className="content">
          <h1 className="page-title">归档</h1>
          {groups.length === 0 ? <div className="empty">还没有文章</div> : null}
          {groups.map((g) => (
            <section key={g.year}>
              <h2 className="archive-year">
                {g.year}
                <span style={{ fontSize: ".72rem", color: "var(--text-p4)", marginLeft: 8, fontWeight: 400 }}>
                  {g.count} 篇
                </span>
              </h2>
              {g.months.map((m) => (
                <div key={m.ym} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: ".78rem", color: "var(--text-p4)", margin: "6px 0 4px" }}>{m.label}</div>
                  {m.posts.map((p) => (
                    <div key={p.id} className="archive-item slide-up">
                      <span className="date">
                        {dateKeyIn(p.published_at || p.created_at).slice(5).replace("-", "/")}
                      </span>
                      <Link href={"/" + encodeURIComponent(p.slug)}>{p.title}</Link>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </main>
        <div className="toc-col"><RightBar /></div>
      </div>
    </>
  );
}
