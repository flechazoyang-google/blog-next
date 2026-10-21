import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";
import { requireAdmin, handle, badRequest, HttpError } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import {
  detectImage, looksLikeMarkup, buildRelativePath, safeJoin, imageSize, sha256,
  MAX_UPLOAD_BYTES, DAILY_UPLOAD_LIMIT,
} from "@/lib/upload";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "public/images");

function startOfToday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest("没有收到文件");

  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest("图片不能超过 " + Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) + "MB");
  }
  if (file.size === 0) throw badRequest("文件是空的");

  const buf = Buffer.from(await file.arrayBuffer());

  // ① 只信 magic bytes：类型与扩展名都由服务端决定（A1 的根因修复）
  const detected = detectImage(buf);
  if (!detected) {
    throw badRequest(
      looksLikeMarkup(buf)
        ? "不支持该格式：SVG/HTML 等可携带脚本的文件一律拒绝"
        : "只支持 PNG / JPEG / GIF / WEBP / AVIF 图片"
    );
  }

  const db = getDb();

  // ② 按天配额：防止把后台当免费图床
  const todayCount = (db
    .prepare("SELECT COUNT(*) c FROM media WHERE created_at >= ?")
    .get(startOfToday()) as { c: number }).c;
  if (todayCount >= DAILY_UPLOAD_LIMIT) {
    throw new HttpError(429, "今日上传已达上限（" + DAILY_UPLOAD_LIMIT + " 张）");
  }

  // ③ 内容去重：同图重复上传直接复用，不占额外磁盘。
  //    注意必须同时确认文件仍存在 —— media 表有记录但磁盘被清掉时（手工清理、
  //    或从备份里恢复了库但没恢复图片），只信表格会返回一个 404 的 URL。
  const digest = sha256(buf);
  const dup = db.prepare("SELECT path, filename FROM media WHERE sha256 = ?").get(digest) as
    | { path: string; filename: string } | undefined;
  if (dup) {
    const relPath = dup.path.replace(/^\/images\//, "");
    const stillThere = await fs
      .access(safeJoin(UPLOAD_DIR, relPath))
      .then(() => true)
      .catch(() => false);
    if (stillThere) {
      return NextResponse.json({ ok: true, url: dup.path, deduped: true });
    }
    // 文件已丢失：删掉失效记录，走下面的正常写入流程
    db.prepare("DELETE FROM media WHERE path = ?").run(dup.path);
  }

  // ④ 落盘：文件名完全由服务端生成，与 file.name / file.type 无关
  const rel = buildRelativePath(detected.ext);
  const abs = safeJoin(UPLOAD_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf, { mode: 0o644 });

  const publicPath = "/images/" + rel;
  const size = imageSize(buf, detected.mime);

  db.prepare(
    "INSERT INTO media (path, filename, mime, size, width, height, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(publicPath, path.basename(abs), detected.mime, buf.length, size?.width ?? null, size?.height ?? null, digest);

  logAudit({
    action: "upload.create",
    userId: ctx.user.id, userName: ctx.user.username,
    targetType: "media", targetId: publicPath,
    meta: { mime: detected.mime, size: buf.length, declaredName: file.name.slice(0, 80), declaredType: file.type },
    ip: ctx.ip, userAgent: ctx.userAgent,
  });

  return NextResponse.json({ ok: true, url: publicPath, mime: detected.mime, width: size?.width, height: size?.height });
});
