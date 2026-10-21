import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const postId = Number(req.nextUrl.searchParams.get("post_id"));
  if (!postId) return NextResponse.json({ error: "missing post_id" }, { status: 400 });
  const rows = getDb().prepare(
    "SELECT id, author, url, content, created_at FROM comments WHERE post_id=? AND status='approved' ORDER BY created_at ASC"
  ).all(postId);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "unknown";

  // 限流：同 IP 10 分钟内最多 3 条
  if (!rateLimit(`comment:${ip}`, 3, 600)) {
    return NextResponse.json({ error: "提交太频繁，请稍后再试" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const { post_id, author, email, url, content, website } = body as Record<string, string>;

  // 蜜罐字段：机器人会填，人看不到
  if (website) return NextResponse.json({ ok: true });

  if (!post_id || !author?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "昵称和内容不能为空" }, { status: 400 });
  }
  if (author.length > 40 || content.length > 2000) {
    return NextResponse.json({ error: "内容过长" }, { status: 400 });
  }

  const post = getDb().prepare("SELECT id FROM posts WHERE id=?").get(Number(post_id));
  if (!post) return NextResponse.json({ error: "文章不存在" }, { status: 404 });

  getDb().prepare(
    "INSERT INTO comments (post_id, author, email, url, content, status, ip, user_agent) VALUES (?,?,?,?,?,'pending',?,?)"
  ).run(
    Number(post_id), author.trim().slice(0, 40), (email || "").trim().slice(0, 120),
    (url || "").trim().slice(0, 200), content.trim(),
    ip, (req.headers.get("user-agent") || "").slice(0, 300)
  );

  return NextResponse.json({ ok: true, message: "评论已提交，待审核后显示" });
}
