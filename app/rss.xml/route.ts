import { listPosts, parseJsonArray, makeExcerpt } from "@/lib/posts";
import { getSettings } from "@/lib/settings";
import { toUtcIso } from "@/lib/time";

export const dynamic = "force-dynamic";

const SITE = process.env.SITE_URL || "https://blog.yghsite.cn";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function GET() {
  const s = getSettings();
  if (!s.rssEnabled) return new Response("RSS 已关闭", { status: 404 });

  const posts = listPosts({ limit: 30 });
  const items = posts.map((p) => {
    const iso = toUtcIso(p.published_at || p.created_at);
    return "\n    <item>" +
      "<title>" + esc(p.title) + "</title>" +
      "<link>" + SITE + "/" + encodeURIComponent(p.slug) + "</link>" +
      '<guid isPermaLink="true">' + SITE + "/" + encodeURIComponent(p.slug) + "</guid>" +
      "<pubDate>" + (iso ? new Date(iso).toUTCString() : "") + "</pubDate>" +
      "<description>" + esc(p.excerpt || makeExcerpt(p.content)) + "</description>" +
      parseJsonArray(p.categories).map((c) => "<category>" + esc(c) + "</category>").join("") +
      "</item>";
  }).join("");

  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0"><channel>' +
    "<title>" + esc(s.siteTitle) + "</title>" +
    "<link>" + SITE + "</link>" +
    "<description>" + esc(s.siteDescription) + "</description>" +
    "<language>zh-CN</language>" +
    "<lastBuildDate>" + new Date().toUTCString() + "</lastBuildDate>" +
    items +
    "\n</channel></rss>";

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
