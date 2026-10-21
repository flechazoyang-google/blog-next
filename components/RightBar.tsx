import Link from "next/link";
import { getSiteStats, getTagCloud } from "@/lib/site-stats";

type Toc = { level: number; text: string; id: string }[];

/** 桌面端右侧栏：站点统计 + 标签云（文章页还会在上面显示目录） */
export async function RightBar({ toc }: { toc?: Toc }) {
  const stats = getSiteStats();
  const tags = getTagCloud(14);

  return (
    <aside className="rightbar">
      {toc && toc.length > 0 ? (
        <section className="rb-block">
          <header className="rb-head">
            <span className="rb-title">本文目录</span>
            <span className="rb-badge">{toc.length}</span>
          </header>
          <ul className="toc-list">
            {toc.map((t, i) => (
              <li key={i} className={t.level === 3 ? "lv3" : ""}>
                <a href={"#" + t.id}>{t.text}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 站点统计 */}
      <section className="rb-block">
        <header className="rb-head">
          <span className="rb-title">站点统计</span>
        </header>
        <div className="stat-grid">
          {stats.map((s) => (
            <div key={s.label} className="stat-cell">
              <span className="stat-ico" aria-hidden>{s.icon}</span>
              <b className="stat-num">{s.value}</b>
              <span className="stat-name">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 标签云 */}
      {tags.length > 0 ? (
        <section className="rb-block">
          <header className="rb-head">
            <span className="rb-title">标签云</span>
            <span className="rb-badge">{tags.length}</span>
          </header>
          <div className="tag-cloud">
            {tags.map((t) => (
              <Link
                key={t.name}
                href={"/tags/" + encodeURIComponent(t.name)}
                className="tag-pill"
                title={`${t.count} 篇文章`}
              >
                <span className="tag-hash">#</span>
                {t.name}
                <span className="tag-num">{t.count}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
