import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  getDb().prepare("UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?").run(user.id);
  return NextResponse.json({ ok: true });
}
