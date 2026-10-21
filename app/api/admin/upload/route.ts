import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "public/images");
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/gif","image/webp","image/avif"]);

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "没有文件" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "只支持图片格式" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片超过 10MB" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ym = new Date().toISOString().slice(0, 7).replace("-", "/");
  const name = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}.${ext}`;
  const rel = `${ym}/${name}`;

  const dir = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, ym);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buf);

  getDb().prepare("INSERT OR IGNORE INTO media (path,filename,mime,size) VALUES (?,?,?,?)")
    .run("/images/" + rel, name, file.type, file.size);

  return NextResponse.json({ ok: true, url: "/images/" + rel });
}
