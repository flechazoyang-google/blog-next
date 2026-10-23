import { listFriendLinksCached } from "@/lib/cached";
import type { FriendLink } from "@/lib/friend-links";

/**
 * 侧栏「友链 / 聚合」区块（2026-10-23）。
 *
 * 数据来自 friend_links 表，后台可增删改（/admin/links）。
 * 分两块渲染：
 *   - 聚合站（kind=hub）做成卡片，带开往这类徽标，视觉上更重
 *   - 友链（kind=friend）紧凑列表
 * 没数据时整块不渲染，不占位。
 */

function HubCard({ link }: { link: FriendLink }) {
  return (
    <a
      className="fl-hub"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.desc || link.name}
    >
      <span className="fl-ico" aria-hidden>🚇</span>
      <span className="fl-body">
        <span className="fl-name">{link.name}</span>
        {link.desc ? <span className="fl-desc">{link.desc}</span> : null}
      </span>
      <span className="fl-out" aria-hidden>↗</span>
    </a>
  );
}

function LinkRow({ link }: { link: FriendLink }) {
  return (
    <a
      className="fl-item"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.desc || link.name}
    >
      <span className="fl-ico" aria-hidden>🔗</span>
      <span className="fl-body">
        <span className="fl-name">{link.name}</span>
        {link.desc ? <span className="fl-desc">{link.desc}</span> : null}
      </span>
      <span className="fl-out" aria-hidden>↗</span>
    </a>
  );
}

export async function FriendLinks() {
  const links = await listFriendLinksCached();
  const hubs = links.filter((l) => l.kind === "hub");
  const friends = links.filter((l) => l.kind !== "hub");

  if (links.length === 0) return null;

  return (
    <>
      {hubs.length > 0 ? (
        <section className="rb-block">
          <header className="rb-head">
            <span className="rb-title">聚合</span>
            <span className="rb-badge">{hubs.length}</span>
          </header>
          <div className="link-list">
            {hubs.map((l) => <HubCard key={l.id} link={l} />)}
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
            {friends.map((l) => <LinkRow key={l.id} link={l} />)}
          </div>
        </section>
      ) : null}
    </>
  );
}
