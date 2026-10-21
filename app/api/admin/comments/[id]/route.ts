import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { action } = await req.json().catch(() => ({}));
  const db = getDb();

  if (action === "approve") db.prepare("UPDATE comments SET status='approved' WHERE id=?").run(Number(id));
  else if (action === "spam") db.prepare("UPDATE comments SET status='spam' WHERE id=?").run(Number(id));
  else if (action === "delete") db.prepare("DELETE FROM comments WHERE id=?").run(Number(id));
  else return NextResponse.json({ error: "unknown action" }, { status: 400 });

  return NextResponse.json({ ok: true });
}
