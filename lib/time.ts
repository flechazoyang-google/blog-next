/**
 * 时间基准（方案 B1 / B2）。
 *
 * 问题根因：历史上写入用 toISOString().replace("T"," ").slice(0,19)，得到的是
 * 「无偏移标记的 UTC 串」；而前端 new Date(str) 对这种格式按**本地时区**解析，
 * 于是 02:00 CST 发布的文章被显示成前一天。
 *
 * 规则：库里一律存 UTC，且一律带 Z（或 T 分隔的完整 ISO）；展示层显式指定时区。
 */

export const STORE_TZ = "UTC";
export const DISPLAY_TZ = process.env.DISPLAY_TZ || "Asia/Shanghai";

/** 写入用：UTC ISO8601，毫秒精度，带 Z */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 把库里的历史值归一成「带 Z 的 UTC ISO」。
 * 兼容三种历史形态：
 *   1) "2026-10-20 18:00:00"          —— datetime("now") 或 JS 拼串，语义 UTC 无标记
 *   2) "2026-10-20T18:00:00"          —— 同上，T 分隔
 *   3) "2026-10-20T18:00:00.000Z"     —— 已经是正确形态
 * 解析不出来的原样返回（不静默吞数据）。
 */
const NAIVE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)$/;
const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;

export function toUtcIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (WITH_OFFSET.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = NAIVE.exec(s);
  if (m) {
    const body = m[2].length === 5 ? m[2] + ":00" : m[2];
    const d = new Date(m[1] + "T" + body + "Z"); // 无标记的历史串按 UTC 解释
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const loose = new Date(s);
  return isNaN(loose.getTime()) ? null : loose.toISOString();
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(style: "date" | "datetime" | "month" | "time", tz: string): Intl.DateTimeFormat {
  const key = style + "|" + tz;
  let f = fmtCache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      style === "date" ? { year: "numeric", month: "numeric", day: "numeric", timeZone: tz }
      : style === "month" ? { year: "numeric", month: "2-digit", timeZone: tz }
      : style === "time" ? { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }
      : { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz };
    f = new Intl.DateTimeFormat("zh-CN", opts);
    fmtCache.set(key, f);
  }
  return f;
}

/** 展示用：按指定时区（默认 Asia/Shanghai）格式化，历史脏值安全 */
export function formatIn(value: string | null | undefined, style: "date" | "datetime" | "month" | "time" = "date", tz: string = DISPLAY_TZ): string {
  const iso = toUtcIso(value);
  if (!iso) return "";
  const d = new Date(iso);
  if (style === "date") { const p = fmt("date", tz).formatToParts(d); return p.find(x=>x.type==="year")!.value + "年" + p.find(x=>x.type==="month")!.value + "月" + p.find(x=>x.type==="day")!.value + "日"; }
  return fmt(style, tz).format(d);
}

/** 取 YYYY-MM-DD（展示时区下），用于归档分组与截断显示 */
export function dateKeyIn(value: string | null | undefined, tz: string = DISPLAY_TZ): string {
  const iso = toUtcIso(value);
  if (!iso) return "";
  const p = fmt("date", tz).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return g("year") + "-" + g("month") + "-" + g("day");
}

export function monthKeyIn(value: string | null | undefined, tz: string = DISPLAY_TZ): string {
  return dateKeyIn(value, tz).slice(0, 7);
}

export function yearKeyIn(value: string | null | undefined, tz: string = DISPLAY_TZ): string {
  return dateKeyIn(value, tz).slice(0, 4);
}
