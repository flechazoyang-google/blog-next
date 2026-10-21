import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb, type MediaRow } from "@/lib/db";
import { requireAdmin, handle, noStore } from "@/lib/guards";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "public/images");

/** 媒体库列表（C5）：media 表此前只写不读，图片无法复用也无法清理 */
export const GET = handle(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 60) || 60, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);

  const db = getDb();
  const where = q ? "WHERE path LIKE ?" : "";
  const args = q ? ["%" + q + "%"] : [];
  const total = (db.prepare("SELECT COUNT(*) c FROM media " + where).get(...args) as { c: number }).c;
  const rows = db.prepare(
    "SELECT * FROM media " + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).all(...args, limit, offset) as MediaRow[];

  // 引用计数：文章正文里出现的 /images/xxx 路径
  const refRow = db.prepare("SELECT COUNT(*) c FROM posts WHERE deleted_at IS NULL AND content LIKE ?");
  const withRefs = rows.map((m) => ({
    ...m,
    refs: (refRow.get("%" + m.path + "%") as { c: number }).c,
  }));

  return noStore(NextResponse.json({ rows: withRefs, total, limit, offset }));
});

/**
 * 扫描孤儿文件：磁盘上有、media 表里没有（或反之）。
 * 原先上传只写表、从不清理，删文章后图片永久残留。
 */
export const POST = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (action !== "scan-orphans") {
    return noStore(NextResponse.json({ error: "未知操作" }, { status: 400 }));
  }

  const db = getDb();
  const known = new Set((db.prepare("SELECT path FROM media").all() as { path: string }[]).map((r) => r.path));

  const onDisk: string[] = [];
  async function walk(dir: string, rel = "") {
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name.startsWith(".")) continue;
      const nextRel = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), nextRel);
      else onDisk.push("/images/" + nextRel);
    }
  }
  await walk(UPLOAD_DIR);

  const notInDb = onDisk.filter((p) => !known.has(p));
  logAudit({
    action: "media.orphans", userId: ctx.user.id, userName: ctx.user.username,
    meta: { onDisk: onDisk.length, inDb: known.size, orphans: notInDb.length },
    ip: ctx.ip, userAgent: ctx.userAgent,
  });

  return noStore(NextResponse.json({
    ok: true,
    onDisk: onDisk.length,
    inDb: known.size,
    orphans: notInDb.slice(0, 200),
    orphanCount: notInDb.length,
  }));
});
