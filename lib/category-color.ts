/** 7 组低饱和配色，按分类名稳定分配 */
const PALETTE = [
  { fg: "var(--cat-1)", bg: "var(--cat-1-bg)" },
  { fg: "var(--cat-2)", bg: "var(--cat-2-bg)" },
  { fg: "var(--cat-3)", bg: "var(--cat-3-bg)" },
  { fg: "var(--cat-4)", bg: "var(--cat-4-bg)" },
  { fg: "var(--cat-5)", bg: "var(--cat-5-bg)" },
  { fg: "var(--cat-6)", bg: "var(--cat-6-bg)" },
  { fg: "var(--cat-7)", bg: "var(--cat-7-bg)" },
];

export function categoryColor(name: string): { fg: string; bg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
