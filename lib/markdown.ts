import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/** 渲染 Markdown，并给标题加 anchor id 以便生成目录 */
/**
 * 修复历史数据里的畸形链接：
 *   "## (https://.../#anchor)标题"  ->  "## 标题"
 *   "[00:20(http://...)]"           ->  "00:20"
 *   "文本 (https://...)"            ->  "文本"
 * 这些都是从 WordPress 的标题锚点转换时产生的噪音。
 */
export function sanitizeMarkdown(md: string): string {
  let t = md;

  // ① 标题行开头的 (URL) 噪音：  "## (https://...#x)标题"  ->  "## 标题"
  //    只匹配行首、且后面紧跟文字的情况
  t = t.replace(/^(#{1,6}[ \t]+)\([ \t]*https?:\/\/[^\s)]+[ \t]*\)[ \t]*/gm, "$1");

  // ② 方括号里套了链接：  "[00:20(http://...)]"  ->  "00:20"
  //    先处理这种，避免被后面的规则误伤
  t = t.replace(/\[([^\[\]]*?)\([ \t]*https?:\/\/[^\s)]+[ \t]*\)\]/g, "$1");

  // ③ 中文/文字后面紧跟的裸括号链接：  "文字 (https://...)"  ->  "文字"
  //    注意必须前面是「非 Markdown 链接语法」的位置：用 (?!\]) 排除 "](url)" 
  t = t.replace(/([^\s\]\[()])[ \t]+\([ \t]*https?:\/\/[^\s)]+[ \t]*\)/g, "$1");

  // ④ 整理多余空格
  t = t.replace(/[ \t]+$/gm, "");

  return t;
}

export function renderMarkdown(md: string): { html: string; toc: { level: number; text: string; id: string }[] } {
  md = sanitizeMarkdown(md);
  const toc: { level: number; text: string; id: string }[] = [];
  const renderer = new marked.Renderer();

  renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
    const plain = text.replace(/<[^>]+>/g, "");
    const id = slugifyHeading(plain);
    if (depth === 2 || depth === 3) toc.push({ level: depth, text: plain, id });
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  const html = marked.parse(md, { renderer, async: false }) as string;
  return { html, toc };
}

function slugifyHeading(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "section";
}
