import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb, type MediaRow } from "@/lib/db";
import { requireAdmin, handle, noStore, badRequest, notFound, conflict } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { safeJoin } from "@/lib/upload";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "public/images");

/** 删除图片：仍被文章引用时拒绝（防止误删正在用的图） */
export const DELETE = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireAdmin(req);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("图片 id 不合法");

  const db = getDb();
  const row = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow | undefined;
  if (!row) throw notFound("图片不存在");

  const refs = (db.prepare("SELECT COUNT(*) c FROM posts WHERE deleted_at IS NULL AND content LIKE ?")
    .get("%" + row.path + "%") as { c: number }).c;
  if (refs > 0) throw conflict("这张图仍被 " + refs + " 篇文章引用，请先移除引用");

  const rel = row.path.replace(/^\/images\//, "");
  try {
    await fs.unlink(safeJoin(UPLOAD_DIR, rel));
  } catch {
    // 文件已不在磁盘上，仍清掉记录
  }
  db.prepare("DELETE FROM media WHERE id = ?").run(id);

  logAudit({
    action: "media.delete", userId: ctx.user.id, userName: ctx.user.username,
    targetType: "media", targetId: row.path, ip: ctx.ip, userAgent: ctx.userAgent,
  });
  return noStore(NextResponse.json({ ok: true }));
});
