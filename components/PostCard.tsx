import Link from "next/link";

type Props = {
  href: string;
  title: string;
  excerpt: string;
  date: string;
  categories?: string[];
  readingTime?: number;
};

export function PostCard({ href, title, excerpt, date, categories = [], readingTime }: Props) {
  return (
    <Link href={href} className="post-card slide-up">
      <h2>{title}</h2>
      {excerpt ? <div className="excerpt">{excerpt}</div> : null}
      <div className="meta">
        <time dateTime={toIso(date)}>{formatDate(date)}</time>
        {readingTime ? <><span className="dot">·</span><span>{readingTime} 分钟</span></> : null}
        {categories.map((c) => (
          <span key={c} className="cat">{c}</span>
        ))}
      </div>
    </Link>
  );
}

export function toIso(d: string): string {
  const t = new Date(d);
  return isNaN(t.getTime()) ? d : t.toISOString();
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
