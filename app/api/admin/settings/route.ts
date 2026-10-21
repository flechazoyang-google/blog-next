import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, handle, noStore } from "@/lib/guards";
import { getSettings, updateSettings, type Settings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { str } from "@/lib/validate";
import { TAGS, REVALIDATE_PROFILE } from "@/lib/posts";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  await requireAdmin(req);
  return noStore(NextResponse.json({ settings: getSettings() }));
});

/** 站点设置（C4）：settings 表此前 0 处引用，站名/描述/页脚全是硬编码 */
export const PUT = handle(async (req: NextRequest) => {
  const ctx = await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return noStore(NextResponse.json({ error: "参数错误" }, { status: 400 }));

  const patch: Partial<Settings> = {};
  const strFields: [keyof Settings, string, number][] = [
    ["siteTitle", "站点标题", 60],
    ["siteSubtitle", "副标题", 80],
    ["siteDescription", "站点描述", 200],
    ["author", "作者", 40],
    ["footerText", "页脚文字", 300],
    ["icp", "备案号", 60],
    ["friendLinks", "友链", 2000],
    ["timezone", "时区", 60],
  ];
  for (const [field, label, max] of strFields) {
    if (body[field] === undefined) continue;
    const r = str(body[field], { field: label, max });
    if (!r.ok) return noStore(NextResponse.json({ error: r.error }, { status: 400 }));
    (patch[field] as string) = r.value;
  }
  if (typeof body.commentEnabled === "boolean") patch.commentEnabled = body.commentEnabled;
  if (typeof body.rssEnabled === "boolean") patch.rssEnabled = body.rssEnabled;

  updateSettings(patch);
  logAudit({
    action: "settings.update", userId: ctx.user.id, userName: ctx.user.username,
    targetType: "setting", meta: { keys: Object.keys(patch) }, ip: ctx.ip, userAgent: ctx.userAgent,
  });
  revalidateTag(TAGS.posts, REVALIDATE_PROFILE);
  revalidateTag(TAGS.stats, REVALIDATE_PROFILE);

  return noStore(NextResponse.json({ ok: true, settings: getSettings() }));
});
