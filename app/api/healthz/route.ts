import { NextResponse } from "next/server";
import { getDb, dbPath } from "@/lib/db";
import { currentVersion, hasFts } from "@/lib/migrations";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * 健康检查（P2-3）。
 * 用于部署后的探活、外部监控、以及"发布是否真的生效"的判据。
 * 刻意不返回任何敏感信息（不含路径以外的配置、不含用户名）。
 */
export async function GET() {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    const c = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
    const s = getSettings();
    const mem = process.memoryUsage();

    return NextResponse.json({
      ok: true,
      time: new Date().toISOString(),
      schema: currentVersion(db),
      fts: hasFts(db),
      posts: c("SELECT COUNT(*) c FROM posts WHERE status = 'published' AND deleted_at IS NULL"),
      comments: c("SELECT COUNT(*) c FROM comments WHERE status = 'approved'"),
      db: dbPath(),
      site: s.siteTitle,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
