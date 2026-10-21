import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAdmin, handle, noStore, badRequest } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { oneOf, slug as vSlug, str, strList, unwrap } from "@/lib/validate";
import { nowIso } from "@/lib/time";
import { makeExcerpt, slugify, uniqueSlug, TAGS, REVALIDATE_PROFILE } from "@/lib/posts";

export const dynamic = "force-dynamic";

const TYPES = ["post", "page", "shuoshuo"] as const;
const STATUSES = ["draft", "published"] as const;

/**
 * 后台列表：分页 + 筛选 + 搜索（C8）。
 * 原实现 SELECT * 全表载入后交给前端过滤。
 */
export const GET = handle(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const type = sp.get("type") ?? "";
  const status = sp.get("status") ?? "";
  const trash = sp.get("trash") === "1";
  const rawLimit = Number(sp.get("limit") ?? 30);
  const lim = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 30;
  const rawOffset = Number(sp.get("offset") ?? 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

  const where: string[] = [trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
  const args: unknown[] = [];
  if (TYPES.includes(type as (typeof TYPES)[number])) { where.push("type = ?"); args.push(type); }
  if (STATUSES.includes(status as (typeof STATUSES)[number])) { where.push("status = ?"); args.push(status); }
  if (q) { where.push("(title LIKE ? OR slug LIKE ?)"); args.push("%" + q + "%", "%" + q + "%"); }
  const whereSql = "WHERE " + where.join(" AND ");

  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) c FROM posts " + whereSql).get(...args) as { c: number }).c;
  const rows = db.prepare(
    "SELECT id, type, title, slug, status, categories, tags, published_at, updated_at, deleted_at " +
    "FROM posts " + whereSql + " ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ? OFFSET ?"
  ).all(...args, lim, offset);

  return noStore(NextResponse.json({ rows, total, limit: lim, offset }));
});

/** 新建：全部入参校验；type 非法现在返回 400 而不是撞 CHECK 抛 500 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw badRequest("参数错误");

  const type = unwrap(oneOf(body.type, TYPES, { field: "类型", fallback: "post" }));
  const title = unwrap(str(body.title, { field: "标题", max: 200 }));
  const content = unwrap(str(body.content, { field: "正文", max: 500000 }));
  const status = unwrap(oneOf(body.status, STATUSES, { field: "状态", fallback: "draft" }));
  const categories = unwrap(strList(body.categories, { field: "分类" }));
  const tags = unwrap(strList(body.tags, { field: "标签" }));
  const customSlug = unwrap(vSlug(body.slug, { field: "URL 路径" }));

  const titleVal = title || (type === "shuoshuo" ? "说说" : "");
  if (type !== "shuoshuo" && !titleVal) throw badRequest("标题不能为空");

  const db = getDb();
  const base = customSlug || slugify(titleVal || "untitled");
  const finalSlug = uniqueSlug(base, (s) =>
    !!db.prepare("SELECT 1 FROM posts WHERE type = ? AND slug = ?").get(type, s)
  );
  if (db.prepare("SELECT 1 FROM post_aliases WHERE slug = ?").get(finalSlug)) {
    throw badRequest("该 URL 路径已被历史别名占用，请换一个");
  }

  const isPublished = status === "published";
  const publishedAt = isPublished ? (typeof body.published_at === "string" ? body.published_at : nowIso()) : null;
  const now = nowIso();

  const info = db.prepare(
    "INSERT INTO posts (type, title, slug, content, excerpt, status, categories, tags, cover, published_at, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    type, titleVal, finalSlug, content, makeExcerpt(content, 160), status,
    JSON.stringify(categories), JSON.stringify(tags),
    typeof body.cover === "string" && body.cover ? body.cover : null,
    publishedAt, now, now
  );

  logAudit({
    action: "post.create", userId: ctx.user.id, userName: ctx.user.username,
    targetType: "post", targetId: Number(info.lastInsertRowid),
    meta: { slug: finalSlug, type, status }, ip: ctx.ip, userAgent: ctx.userAgent,
  });
  revalidateTag(TAGS.posts, REVALIDATE_PROFILE);

  return noStore(NextResponse.json({ ok: true, id: Number(info.lastInsertRowid), slug: finalSlug }));
});
