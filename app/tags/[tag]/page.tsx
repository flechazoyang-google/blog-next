import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { PostCard } from "@/components/PostCard";
import { getDb } from "@/lib/db";
import { makeExcerpt, parseJsonArray, decodeSlug } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return { title: "标签：" + decodeSlug(tag) };
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: raw } = await params;
  const tag = decodeSlug(raw);
  const db = getDb();

  // tags 存的是 JSON 数组字符串，用 LIKE 粗筛后再精确过滤
  const candidates = db.prepare(
    "SELECT * FROM posts WHERE type='post' AND status='published' AND tags LIKE ? ORDER BY published_at DESC"
  ).all("%" + tag + "%") as any[];

  const posts = candidates.filter((p) => parseJsonArray(p.tags).includes(tag));

  return (
    <>
      <Animations />
      <div className="site-shell">
        <Sidebar active="" />
        <main className="content">
          <h1 className="page-title">标签：{tag}</h1>
          <p style={{ fontSize: ".85rem", color: "var(--text-p4)", margin: "-16px 0 24px" }}>
            共 {posts.length} 篇文章
          </p>
          <div className="post-list">
            {posts.map((p) => (
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
