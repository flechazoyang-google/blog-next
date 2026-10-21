import { listPosts, parseJsonArray, makeExcerpt } from "@/lib/posts";

export const dynamic = "force-dynamic";

const SITE = "https://blog.yghsite.cn";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = listPosts({ limit: 30 });
  const items = posts.map((p) => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE}/${encodeURIComponent(p.slug)}</link>
      <guid isPermaLink="true">${SITE}/${encodeURIComponent(p.slug)}</guid>
      <pubDate>${new Date(p.published_at || p.created_at).toUTCString()}</pubDate>
      <description>${esc(p.excerpt || makeExcerpt(p.content))}</description>
      ${parseJsonArray(p.categories).map((c) => `<category>${esc(c)}</category>`).join("")}
    </item>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>flechazo's blog</title>
  <link>${SITE}</link>
  <description>记录 AI、开发与折腾的日常</description>
  <language>zh-CN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${items}
</channel></rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
