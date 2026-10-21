import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { RightBar } from "@/components/RightBar";
import { formatDate } from "@/components/PostCard";
import { listShuoshuoCached } from "@/lib/cached";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";
export const metadata = { title: "说说" };

export default async function ShuoshuoPage() {
  const items = await listShuoshuoCached(100);
  return (
    <>
      <Animations />
      <div className="site-shell">
        <Sidebar active="/shuoshuo" />
        <main className="content">
          <h1 className="page-title">说说</h1>
          <div>
            {items.length === 0 ? (
              <div className="empty">还没有说说</div>
            ) : items.map((s) => (
              <div key={s.id} className="shuo-item slide-up">
                <div className="shuo-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.content).html }} />
                <div className="shuo-date">{formatDate(s.published_at || s.created_at)}</div>
              </div>
            ))}
          </div>
        </main>
        <div className="toc-col"><RightBar /></div>
      </div>
    </>
  );
}
