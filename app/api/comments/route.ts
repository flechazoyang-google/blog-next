import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { httpUrl, email as vEmail, int, str } from "@/lib/validate";
import { nowIso } from "@/lib/time";
import { handle, noStore } from "@/lib/guards";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const postId = Number(req.nextUrl.searchParams.get("post_id"));
  if (!Number.isInteger(postId) || postId <= 0) {
    return noStore(NextResponse.json({ error: "缺少 post_id" }, { status: 400 }));
  }
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, author, url, content, created_at, parent_id FROM comments " +
    "WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC"
  ).all(postId);
  return noStore(NextResponse.json(rows));
});

/**
 * 提交评论。
 *
 * 改动点：
 *   - IP 取 x-real-ip（原取 XFF 首段，可伪造 -> 评论限流形同虚设）
 *   - url 只允许 http/https（原只截断 200 字符，javascript:alert(1) 能入库，
 *     而前端直接 href={c.url}）
 *   - 支持 parent_id 一级回复
 *   - 同 IP 累计垃圾过多的自动进 spam
 */
export const POST = handle(async (req: NextRequest) => {
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  const limit = consume("comment:ip:" + ip, 3, 600);
  if (!limit.ok) {
    return noStore(NextResponse.json(
      { error: "提交太频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    ));
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return noStore(NextResponse.json({ error: "参数错误" }, { status: 400 }));

  // 蜜罐：机器人会填，人看不到
  if (typeof body.website === "string" && body.website.trim()) {
    return noStore(NextResponse.json({ ok: true }));
  }

  const pid = int(body.post_id, { field: "文章" });
  const author = str(body.author, { field: "昵称", required: true, max: 40 });
  const content = str(body.content, { field: "内容", required: true, max: 2000 });
  const url = httpUrl(body.url, { field: "网址" });
  const mail = vEmail(body.email, { field: "邮箱" });
  for (const r of [pid, author, content, url, mail]) {
    if (!r.ok) return noStore(NextResponse.json({ error: r.error }, { status: 400 }));
  }

  const db = getDb();
  const post = db.prepare("SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL").get((pid as { value: number }).value);
  if (!post) return noStore(NextResponse.json({ error: "文章不存在" }, { status: 404 }));

  // 一级回复：parent 必须属于同一篇文章
  let parentId: number | null = null;
  if (body.parent_id !== undefined && body.parent_id !== null) {
    const p = int(body.parent_id, { field: "回复目标" });
    if (p.ok) {
      const parent = db.prepare("SELECT id FROM comments WHERE id = ? AND post_id = ?")
        .get(p.value, (pid as { value: number }).value);
      if (parent) parentId = p.value;
    }
  }

  // 自动反垃圾：该 IP 已有 3 条以上 spam，则直接进 spam 而不是 pending
  const spamCount = (db.prepare("SELECT COUNT(*) c FROM comments WHERE ip = ? AND status = 'spam'").get(ip) as { c: number }).c;
  const autoSpam = spamCount >= 3;

  db.prepare(
    "INSERT INTO comments (post_id, author, email, url, content, status, ip, user_agent, parent_id, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    (pid as { value: number }).value,
    (author as { value: string }).value,
    (mail as { value: string }).value,
    (url as { value: string }).value,
    (content as { value: string }).value,
    autoSpam ? "spam" : "pending",
    ip, ua.slice(0, 300), parentId, nowIso()
  );

  return noStore(NextResponse.json({
    ok: true,
    message: autoSpam ? "评论已提交（待人工复核）" : "评论已提交，待审核后显示",
  }));
});
