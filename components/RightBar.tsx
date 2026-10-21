import Link from "next/link";
import { getSiteStats, getTagCloud } from "@/lib/site-stats";

type Toc = { level: number; text: string; id: string }[];

/** 桌面端右侧栏：站点统计 + 标签云（文章页还会在上面显示目录） */
export function RightBar({ toc }: { toc?: Toc }) {
  const stats = getSiteStats();
  const tags = getTagCloud(12);

  return (
    <aside className="rightbar">
      {toc && toc.length > 0 ? (
        <div className="rightbar-block toc-block">
          <div className="rightbar-title">本文目录</div>
          <ul className="toc-list">
            {toc.map((t, i) => (
              <li key={i} className={t.level === 3 ? "lv3" : ""}>
                <a href={"#" + t.id}>{t.text}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rightbar-block">
        <div className="rightbar-title">站点统计</div>
        <div className="stat-grid">
          {stats.map((s) => (
            <div key={s.label} className="stat-item">
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="rightbar-block">
          <div className="rightbar-title">标签云</div>
          <div className="tag-cloud-items">
            {tags.map((t) => (
              <Link
                key={t.name}
                href={"/tags/" + encodeURIComponent(t.name)}
                className="tag-cloud-item"
                style={{ fontSize: t.size + "rem" }}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
