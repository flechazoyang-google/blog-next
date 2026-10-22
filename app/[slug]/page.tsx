import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { Animations } from "@/components/Animations";
import { formatDate, toIso } from "@/components/PostCard";
import { decodeSlug, prevNextPost, parseJsonArray, readingTime, makeExcerpt } from "@/lib/posts";
import { resolveSlugCached, getPageBySlugCached, getPageViewsCached, getSettingsCached } from "@/lib/cached";
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
  const { post, redirectTo } = await resolveSlugCached(slug);
  const doc = post ?? (await getPageBySlugCached(slug));
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

  // B8：改过 slug 的旧地址永久跳转到新地址，收录不断链。
  //
  // 用 permanentRedirect() 而不是 redirect()：
  //   redirect()      -> 307 临时，搜索引擎不会把权重/索引转移到新地址，
  //                      别名表就失去意义了
  //   permanentRedirect() -> 308 永久（等价 301 的语义，且保留请求方法）
  // 注：Server Component 里无法直接返回 301，308 是 Next 提供的最接近的永久跳转。
  const resolved = await resolveSlugCached(slug);
  if (resolved.redirectTo) permanentRedirect("/" + encodeURIComponent(resolved.redirectTo));

  const post = resolved.post && resolved.post.type === "post" ? resolved.post : null;
  const page = post ? null : await getPageBySlugCached(slug);
  const doc = post ?? page;
  if (!doc) notFound();

  const { html, toc } = renderMarkdown(doc.content);
  const cats = parseJsonArray(doc.categories);
  const tags = parseJsonArray(doc.tags);
  const nav = post ? prevNextPost(doc.published_at || doc.created_at) : {};
  const pageViews = await getPageViewsCached("/" + decodeSlug(slug));
  const settings = await getSettingsCached();

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
              {nav.prev ? (
                <Link href={"/" + encodeURIComponent(nav.prev.slug)} className="article-nav-item prev">
                  <span className="article-nav-label">
                    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
                      <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    上一篇
                  </span>
                  <span className="article-nav-title">{nav.prev.title}</span>
                </Link>
              ) : <span />}
              {nav.next ? (
                <Link href={"/" + encodeURIComponent(nav.next.slug)} className="article-nav-item next">
                  <span className="article-nav-label">
                    下一篇
                    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
                      <path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="article-nav-title">{nav.next.title}</span>
                </Link>
              ) : null}
            </nav>
          ) : null}

          {/* 评论：按「单页开关 + 全站开关」双重判断。
              原先只判断 post（文章 type），导致「友链」「关于」这类页面完全没有评论区。
              现在用 posts.comments_enabled 逐条控制（隐私政策默认关闭）。 */}
          {doc && settings.commentEnabled && doc.comments_enabled !== 0 ? (
            <CommentSection postId={doc.id} pageKey={"/" + decodeSlug(slug)} />
          ) : null}
        </main>
        <div className="toc-col"><RightBar toc={toc} /></div>
      </div>
    </>
  );
}
