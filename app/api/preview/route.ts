import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { content } = await req.json().catch(() => ({ content: "" }));
  return NextResponse.json({ html: renderMarkdown(content || "").html });
}
