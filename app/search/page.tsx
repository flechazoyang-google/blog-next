import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { SearchBox } from "@/components/SearchBox";
import { PostCard } from "@/components/PostCard";
import { getDb } from "@/lib/db";
import { makeExcerpt, parseJsonArray } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata = { title: "搜索" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const keyword = q.trim();

  let results: any[] = [];
  if (keyword) {
    const db = getDb();
    const like = "%" + keyword.replace(/[%_]/g, "") + "%";
    results = db.prepare(
      `SELECT * FROM posts
       WHERE type='post' AND status='published'
         AND (title LIKE ? OR content LIKE ?)
       ORDER BY published_at DESC LIMIT 50`
    ).all(like, like) as any[];
  }

  return (
    <>
      <Animations />
      <div className="site-shell">
        <Sidebar active="" />
        <main className="content">
          <SearchBox initial={keyword} />
          {keyword ? (
            <p style={{ fontSize: ".85rem", color: "var(--text-p4)", margin: "4px 0 20px" }}>
              {results.length > 0
                ? `找到 ${results.length} 篇与「${keyword}」相关的文章`
                : `没有找到与「${keyword}」相关的文章`}
            </p>
          ) : null}

          <div className="post-list">
            {results.map((p) => (
              <PostCard
                key={p.id}
                href={`/${encodeURIComponent(p.slug)}`}
                title={p.title}
                excerpt={p.excerpt || makeExcerpt(p.content)}
                date={p.published_at || p.created_at}
                categories={parseJsonArray(p.categories)}
              />
            ))}
          </div>
        </main>
        <div className="toc-col" />
      </div>
    </>
  );
}
