import { NextRequest, NextResponse } from "next/server";
import { searchPosts } from "@/lib/search";

export const dynamic = "force-dynamic";

/** C10：FTS5 + LIKE 混合；只回摘要，不回整篇正文 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ hits: [], mode: "like" });
  const { hits, mode } = searchPosts(q, { limit: 20 });
  return NextResponse.json(
    { hits, mode },
    { headers: { "Cache-Control": "no-store" } }
  );
}
