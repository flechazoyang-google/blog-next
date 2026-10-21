import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/** 渲染 Markdown，并给标题加 anchor id 以便生成目录 */
export function renderMarkdown(md: string): { html: string; toc: { level: number; text: string; id: string }[] } {
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
