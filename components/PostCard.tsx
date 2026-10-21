import Link from "next/link";
import { formatIn, toUtcIso } from "@/lib/time";
import { categoryColor } from "@/lib/category-color";

type Props = {
  href: string;
  title: string;
  excerpt: string;
  date: string;
  categories?: string[];
  readingTime?: number;
  views?: number;
};

export function PostCard({ href, title, excerpt, date, categories = [], readingTime, views }: Props) {
  return (
    <Link href={href} className="post-card slide-up">
      <h2>{title}</h2>
      {excerpt ? <div className="excerpt">{excerpt}</div> : null}
      <div className="meta">
        <time dateTime={toIso(date)}>{formatDate(date)}</time>
        {readingTime ? <><span className="dot">·</span><span>{readingTime} 分钟</span></> : null}
        {typeof views === "number" && views > 0 ? (
          <>
            <span className="dot">·</span>
            <span className="views-badge">
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
                      fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              {views}
            </span>
          </>
        ) : null}
        {categories.map((c) => {
          const col = categoryColor(c);
          return (
            <span key={c} className="cat" style={{ color: col.fg, background: col.bg }}>
              {c}
            </span>
          );
        })}
      </div>
    </Link>
  );
}

/**
 * B1：原实现 new Date("2026-10-20 18:00:00") 按**本地时区**解析，
 * 而库里存的是 UTC，导致 02:00 CST 发布的文章显示成前一天。
 * 现在统一走 lib/time.ts：先归一为带 Z 的 UTC，再按展示时区格式化。
 */
export function toIso(d: string): string {
  return toUtcIso(d) ?? d;
}

export function formatDate(iso: string): string {
  return formatIn(iso, "date");
}
