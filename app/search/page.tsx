import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { searchPosts } from "@/lib/search";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "搜索" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const { hits, mode } = q ? searchPosts(q, { limit: 30 }) : { hits: [], mode: "like" as const };

  return (
    <>
      <Animations />
      <div className="site-shell">
        <Sidebar active="/search" />
        <main className="content">
          <h1 className="page-title">搜索</h1>
          <form method="get" style={{ marginBottom: 20 }}>
            <input className="input" name="q" defaultValue={q} placeholder="输入关键词（2 字以上即可）" />
          </form>

          {q ? (
            <p style={{ fontSize: ".82rem", color: "var(--text-p4)", marginBottom: 16 }}>
              {hits.length > 0 ? "找到 " + hits.length + " 篇" : "没有找到相关文章"}
              {mode === "fts" ? " · 全文索引" : " · 关键词匹配"}
            </p>
          ) : null}

          <div className="post-list">
            {hits.map((h) => (
              <Link key={h.id} href={"/" + encodeURIComponent(h.slug)} className="post-card">
                <h2>{h.title}</h2>
                <p>{h.excerpt}</p>
                <span className="date">{h.date}</span>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
