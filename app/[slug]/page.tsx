import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { formatDate, toIso } from "@/components/PostCard";
import { decodeSlug, resolveSlug, parseJsonArray, readingTime, prevNextPost, makeExcerpt, getPageBySlug } from "@/lib/posts";
import { renderMarkdown } from "@/lib/markdown";
import { CommentSection } from "@/components/CommentSection";
import { Lightbox } from "@/components/Lightbox";
import { categoryColor } from "@/lib/category-color";
import { RightBar } from "@/components/RightBar";
import { getPageViews } from "@/lib/site-stats";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { post, redirectTo } = resolveSlug(slug);
  const doc = post ?? getPageBySlug(slug);
  if (!doc || redirectTo) return {};
  const desc = doc.excerpt || makeExcerpt(doc.content);
  return {
    title: doc.title,
    description: desc,
    openGraph: {
      type: "article",
      title: doc.title,
      description: desc,
      // C6：cover 字段此前 API 支持、前台完全不用 -> 分享出去没有卡片图
      images: doc.cover ? [doc.cover] : undefined,
    },
    twitter: {
      card: doc.cover ? "summary_large_image" : "summary",
      title: doc.title,
      description: desc,
      images: doc.cover ? [doc.cover] : undefined,
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // B8：改过 slug 的旧地址 301 到新地址，收录不断链
  const resolved = resolveSlug(slug);
  if (resolved.redirectTo) redirect("/" + encodeURIComponent(resolved.redirectTo));

  const post = resolved.post && resolved.post.type === "post" ? resolved.post : null;
  const page = post ? null : getPageBySlug(slug);
  const doc = post ?? page;
  if (!doc) notFound();

  const { html, toc } = renderMarkdown(doc.content);
  const cats = parseJsonArray(doc.categories);
  const tags = parseJsonArray(doc.tags);
  const nav = post ? prevNextPost(doc.published_at || doc.created_at) : {};
  const pageViews = getPageViews("/" + decodeSlug(slug));
  const settings = getSettings();

  return (
    <>
      <Animations />
      <Lightbox />
      <div className="site-shell">
        <Sidebar active={"/" + decodeSlug(slug)} />
        <main className="content">
          <article>
            <header className="article-header">
              {cats.length > 0 ? (
                <div className="article-eyebrow">
                  {cats.map((c) => {
                    const col = categoryColor(c);
                    return (
                      <span key={c} className="cat-pill" style={{ color: col.fg, background: col.bg }}>
                        {c}
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <h1 className="article-title">{doc.title}</h1>
              <div className="article-meta-bar">
                <time dateTime={toIso(doc.published_at || doc.created_at)}>
                  {formatDate(doc.published_at || doc.created_at)}
                </time>
                <span className="dot">·</span>
                <span>{readingTime(doc.content)} 分钟</span>
                {pageViews !== null ? (
                  <>
                    <span className="dot">·</span>
                    <span>{pageViews} 次浏览</span>
                  </>
                ) : null}
              </div>
            </header>

            {doc.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.cover} alt={doc.title}
                   style={{ width: "100%", borderRadius: 12, marginBottom: 20, border: "1px solid var(--border)" }} />
            ) : null}

            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          </article>

          {nav.prev || nav.next ? (
            <nav className="article-nav" aria-label="上下篇">
              {nav.prev ? <Link href={"/" + encodeURIComponent(nav.prev.slug)} className="btn btn-sm">← {nav.prev.title}</Link> : <span />}
              {nav.next ? <Link href={"/" + encodeURIComponent(nav.next.slug)} className="btn btn-sm">{nav.next.title} →</Link> : null}
            </nav>
          ) : null}

          {post && settings.commentEnabled ? <CommentSection postId={doc.id} /> : null}
        </main>
        <div className="toc-col"><RightBar toc={toc} /></div>
      </div>
    </>
  );
}
