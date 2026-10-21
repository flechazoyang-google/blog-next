import { NextResponse } from "next/server";
import { currentUser, createTotpSecret, totpUri } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const secret = createTotpSecret();
  // 暂存，确认后才置 enabled
  getDb().prepare("UPDATE users SET totp_secret=? WHERE id=?").run(secret, user.id);
  return NextResponse.json({ secret, uri: totpUri(secret, user.username) });
}
