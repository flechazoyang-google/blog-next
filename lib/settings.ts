import { getDb } from "./db";

/**
 * 站点设置（方案 C4）。
 *
 * 背景：settings 表早就建了，但**全库 0 处引用** —— 站名、描述、页脚、友链
 * 全部硬编码在 layout.tsx / rss.xml / sitemap.ts 里，改一个字要重新构建。
 * 这里把它变成真的可用配置。
 */
export type Settings = {
  siteTitle: string;
  siteSubtitle: string;
  siteDescription: string;
  author: string;
  footerText: string;
  icp: string;
  friendLinks: string;
  timezone: string;
  commentEnabled: boolean;
  rssEnabled: boolean;
  umamiTotal: string;
};

export const DEFAULT_SETTINGS: Settings = {
  siteTitle: "flechazo's blog",
  siteSubtitle: "扬帆起航",
  siteDescription: "记录 AI、开发与折腾的日常。",
  author: "flechazo",
  footerText: "",
  icp: "",
  friendLinks: "",
  timezone: "Asia/Shanghai",
  commentEnabled: true,
  rssEnabled: true,
  umamiTotal: "",
};

const KEY_MAP: Record<string, keyof Settings> = {
  site_title: "siteTitle",
  site_subtitle: "siteSubtitle",
  site_description: "siteDescription",
  author: "author",
  footer_text: "footerText",
  icp: "icp",
  friend_links: "friendLinks",
  timezone: "timezone",
  comment_enabled: "commentEnabled",
  rss_enabled: "rssEnabled",
  umami_total: "umamiTotal",
  "umami:total": "umamiTotal",
};

const REVERSE: Record<keyof Settings, string> = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, k])
) as Record<keyof Settings, string>;

/** 进程内缓存：settings 读多写少，避免每请求一次查询 */
let cache: { at: number; value: Settings } | null = null;
const TTL_MS = 10_000;

export function invalidateSettingsCache(): void {
  cache = null;
}

export function getSettings(): Settings {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const value: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    const field = KEY_MAP[r.key];
    if (!field) continue;
    if (field === "commentEnabled" || field === "rssEnabled") {
      (value[field] as boolean) = r.value === "1" || r.value === "true";
    } else {
      (value[field] as string) = r.value;
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

export function updateSettings(patch: Partial<Settings>): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  db.transaction(() => {
    for (const [field, v] of Object.entries(patch)) {
      const key = REVERSE[field as keyof Settings];
      if (!key || v === undefined) continue;
      stmt.run(key, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
    }
  })();
  invalidateSettingsCache();
}

/** 供 Umami 定时任务写回，不经过后台（P4） */
export function setStatValue(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
  invalidateSettingsCache();
}

export function getRawSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
