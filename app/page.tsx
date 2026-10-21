import { Sidebar } from "@/components/Sidebar";
import { PostCard } from "@/components/PostCard";
import { Animations } from "@/components/Animations";
import { RightBar } from "@/components/RightBar";
import { listPosts, countPosts, parseJsonArray, makeExcerpt, readingTime } from "@/lib/posts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const posts = listPosts({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const total = countPosts();

  return (
    <>
      <Animations />
      <div className="site-shell">
        <Sidebar active="/" />
        <main className="content">
          <div className="post-list">
            {posts.length === 0 ? (
              <div className="empty">还没有文章</div>
            ) : (
              posts.map((p) => (
                <PostCard
                  key={p.id}
                  href={`/${encodeURIComponent(p.slug)}`}
                  title={p.title}
                  excerpt={p.excerpt || makeExcerpt(p.content)}
                  date={p.published_at || p.created_at}
                  categories={parseJsonArray(p.categories)}
                  readingTime={readingTime(p.content)}
                />
              ))
            )}
          </div>
          {total > PAGE_SIZE ? (
            <div className="pager">
              {page > 1 ? <a className="btn btn-sm" href={`/?page=${page - 1}`}>上一页</a> : null}
              <span className="btn btn-sm" style={{ pointerEvents: "none", opacity: .6 }}>
                {page} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              {page * PAGE_SIZE < total ? <a className="btn btn-sm" href={`/?page=${page + 1}`}>下一页</a> : null}
            </div>
          ) : null}
        </main>
        <div className="toc-col"><RightBar /></div>
      </div>
    </>
  );
}
