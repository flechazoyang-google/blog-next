import { listFriendLinksCached, getSiteStatsCached, getTagCloudCached } from "@/lib/cached";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 手机端侧栏的内容（2026-10-23）。
 *
 * 桌面右栏容器 .toc-col 在 **≤1200px 就 display:none**，手机/平板看不到
 * 统计、聚合外链、友链、标签云。这里把同样内容做成可开合的右侧抽屉，
 * 数据走同一套 cached 函数，与桌面端天然一致。
 *
 * 只负责"内容"，外壳（触发按钮 / 遮罩 / 关闭逻辑）在 MobileNav 里，
 * 因为顶部栏和抽屉都是它渲染的，放一起才能避开 header 的
 * backdrop-filter 包含块问题。
 */
export async function MobileSidebarContent() {
  const [stats, tags, links] = await Promise.all([
    getSiteStatsCached(),
    getTagCloudCached(14),
    listFriendLinksCached(),
  ]);

  const hubs = links.filter((l) => l.kind === "hub");
  const friends = links.filter((l) => l.kind !== "hub");

  return (
    <>
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

      {hubs.length > 0 ? (
        <section className="rb-block">
          <header className="rb-head">
            <span className="rb-title">聚合</span>
            <span className="rb-badge">{hubs.length}</span>
          </header>
          <div className="link-list">
            {hubs.map((l) => (
              <a key={l.id} className="fl-hub" href={l.url} target="_blank"
                 rel="noopener noreferrer" title={l.desc || l.name}>
                <span className="fl-ico" aria-hidden>🚇</span>
                <span className="fl-body">
                  <span className="fl-name">{l.name}</span>
                  {l.desc ? <span className="fl-desc">{l.desc}</span> : null}
                </span>
                <span className="fl-out" aria-hidden>↗</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {friends.length > 0 ? (
        <section className="rb-block">
          <header className="rb-head">
            <span className="rb-title">友链</span>
            <span className="rb-badge">{friends.length}</span>
          </header>
          <div className="link-list">
            {friends.map((l) => (
              <a key={l.id} className="fl-item" href={l.url} target="_blank"
                 rel="noopener noreferrer" title={l.desc || l.name}>
                <span className="fl-ico" aria-hidden>🔗</span>
                <span className="fl-body">
                  <span className="fl-name">{l.name}</span>
                  {l.desc ? <span className="fl-desc">{l.desc}</span> : null}
                </span>
                <span className="fl-out" aria-hidden>↗</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

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
                title={t.count + " 篇文章"}
              >
                <span className="tag-hash">#</span>
                {t.name}
                <span className="tag-num">{t.count}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
