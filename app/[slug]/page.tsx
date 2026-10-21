import { notFound } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { formatDate, toIso } from "@/components/PostCard";
import { decodeSlug, getPostBySlug, getPageBySlug, parseJsonArray, readingTime, prevNextPost, makeExcerpt } from "@/lib/posts";
import { renderMarkdown } from "@/lib/markdown";
import { CommentSection } from "@/components/CommentSection";
import { Lightbox } from "@/components/Lightbox";
import { categoryColor } from "@/lib/category-color";
import { RightBar } from "@/components/RightBar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug) ?? getPageBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt || makeExcerpt(post.content),
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const page = post ? null : getPageBySlug(slug);
  const doc = post ?? page;
  if (!doc) notFound();

  const { html, toc } = renderMarkdown(doc.content);
  const cats = parseJsonArray(doc.categories);
  const tags = parseJsonArray(doc.tags);
  const nav = post ? prevNextPost(doc.published_at || doc.created_at) : {};

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
                <span>{readingTime(doc.content)} 分钟阅读</span>
                <span className="dot">·</span>
                <span>{doc.content.replace(/\s/g, "").length} 字</span>
              </div>
            </header>

            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

            {tags.length > 0 ? (
              <div className="tags">
                {tags.map((t) => <span key={t} className="tag">#{t}</span>)}
              </div>
            ) : null}
          </article>

          {post ? (
            <nav className="post-nav">
              {nav.prev ? (
                <Link href={`/${encodeURIComponent(nav.prev.slug)}`}>
                  <span className="label">上一篇</span>
                  <span className="title">{nav.prev.title}</span>
                </Link>
              ) : <div />}
              {nav.next ? (
                <Link href={`/${encodeURIComponent(nav.next.slug)}`} className="next">
                  <span className="label">下一篇</span>
                  <span className="title">{nav.next.title}</span>
                </Link>
              ) : <div />}
            </nav>
          ) : null}

          {post ? <CommentSection postId={doc.id} /> : null}
        </main>
        <div className="toc-col">
          <RightBar toc={toc} />
        </div>
      </div>
    </>
  );
}
