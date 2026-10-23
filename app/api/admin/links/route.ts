import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handle, noStore, badRequest, notFound } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { invalidate } from "@/lib/purge";
import { TAGS } from "@/lib/posts";
import { str, oneOf, int, httpUrl, unwrap } from "@/lib/validate";
import {
  listFriendLinks, createFriendLink, updateFriendLink, deleteFriendLink, getFriendLink,
  isSafeUrl, type FriendLinkKind,
} from "@/lib/friend-links";

export const dynamic = "force-dynamic";

/** 后台：友链/聚合外链列表（含隐藏项，前台只展示 visible=1） */
export const GET = handle(async (req: NextRequest) => {
  await requireAdmin(req);
  return noStore(NextResponse.json({ links: listFriendLinks() }));
});

type Parsed = {
  name: string; url: string; desc: string;
  kind: FriendLinkKind; sort_order: number; visible: boolean;
};

/**
 * 校验并归一化。
 * base 给 PUT 兜底（未传的字段沿用原值），POST 时不传 base 即要求必填。
 */
function parse(body: Record<string, unknown>, base?: Parsed): Parsed {
  const name = unwrap(str(body.name ?? base?.name, { field: "名称", required: true, max: 40 }));

  const rawUrl = unwrap(httpUrl(body.url ?? base?.url, { field: "链接" }));
  if (!rawUrl) throw badRequest("链接不能为空");
  if (!isSafeUrl(rawUrl)) throw badRequest("链接只支持 http/https");

  return {
    name,
    url: rawUrl,
    desc: unwrap(str(body.desc ?? base?.desc, { field: "描述", max: 80 })),
    kind: unwrap(oneOf(body.kind ?? base?.kind, ["friend", "hub"] as const, { field: "分类" })) as FriendLinkKind,
    sort_order: unwrap(int(body.sort_order ?? base?.sort_order, { field: "排序", min: 0, max: 9999 })),
    visible: typeof body.visible === "boolean" ? body.visible : (base?.visible ?? true),
  };
}

/** 新增一条外链 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw badRequest("参数错误");

  // POST 时 sort_order 缺省给 100，避免必填项过多
  const input = parse({ sort_order: 100, ...body });
  const id = createFriendLink(input);

  logAudit({
    action: "links.create", userId: ctx.user.id, userName: ctx.user.username,
    targetType: "friend_link", targetId: String(id), meta: { name: input.name },
    ip: ctx.ip, userAgent: ctx.userAgent,
  });
  invalidate([TAGS.stats]);
  return noStore(NextResponse.json({ ok: true, id }));
});

/** 修改：未传的字段沿用原值，不会误清空 */
export const PUT = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw badRequest("参数错误");

  const id = unwrap(int(body.id, { field: "ID", min: 1 }));
  const existing = getFriendLink(id);
  if (!existing) throw notFound("外链不存在");

  const base: Parsed = {
    name: existing.name, url: existing.url, desc: existing.desc,
    kind: existing.kind, sort_order: existing.sort_order, visible: existing.visible === 1,
  };
  const input = parse(body, base);
  updateFriendLink(id, input);

  logAudit({
    action: "links.update", userId: ctx.user.id, userName: ctx.user.username,
    targetType: "friend_link", targetId: String(id), meta: { name: input.name },
    ip: ctx.ip, userAgent: ctx.userAgent,
  });
  invalidate([TAGS.stats]);
  return noStore(NextResponse.json({ ok: true }));
});

/** 删除 */
export const DELETE = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw badRequest("ID 不合法");

  const existing = getFriendLink(id);
  if (!existing) throw notFound("外链不存在");
  deleteFriendLink(id);

  logAudit({
    action: "links.delete", userId: ctx.user.id, userName: ctx.user.username,
    targetType: "friend_link", targetId: String(id), meta: { name: existing.name },
    ip: ctx.ip, userAgent: ctx.userAgent,
  });
  invalidate([TAGS.stats]);
  return noStore(NextResponse.json({ ok: true }));
});
