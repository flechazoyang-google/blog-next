import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { formatDate } from "@/components/PostCard";
import { listArchives } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata = { title: "归档" };

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
            <section key={g.ym}>
              <h2 className="archive-year">{g.ym}</h2>
              {g.posts.map((p) => (
                <div key={p.id} className="archive-item slide-up">
                  <span className="date">{(p.published_at || "").slice(5, 10).replace("-", "/")}</span>
                  <Link href={`/${encodeURIComponent(p.slug)}`}>{p.title}</Link>
                </div>
              ))}
            </section>
          ))}
        </main>
        <div className="toc-col" />
      </div>
    </>
  );
}
