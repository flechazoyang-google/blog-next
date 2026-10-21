import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * 搜索集成测试（真实 SQLite + FTS5）。
 *
 * 必须独立成文件：lib/db.ts 的 getDb() 是进程级单例，
 * 若与其它测试同文件，会沿用已被前序用例初始化的 data/blog.db。
 * 这里在**任何 lib 动态导入之前**先把 DATA_DIR 指向临时目录。
 */
// 注意：不要放在 .probe 下 —— 那是会被清理的一次性目录，
// 父目录不存在时 mkdtempSync 会直接抛错（且沙箱里 os.tmpdir() 可能为空）。
const TMP_ROOT = path.join(process.cwd(), ".tmp-tests");
fs.mkdirSync(TMP_ROOT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(TMP_ROOT, "search-"));
process.env.DATA_DIR = TMP;

const dbMod = await import("../lib/db.ts");
const searchMod = await import("../lib/search.ts");
const timeMod = await import("../lib/time.ts");
const settingsMod = await import("../lib/settings.ts");
const statsMod = await import("../lib/site-stats.ts");

test("FTS 集成：>=3 字走 FTS，2 字自动降级 LIKE", () => {
  const db = dbMod.getDb();
  const longBody = "介绍霍夫变换在图像检测中的应用。" + "填充".repeat(400);
  db.prepare("INSERT INTO posts (type, slug, title, content, status, published_at, created_at, updated_at) VALUES ('post','hough','霍夫变换底层原理',?,'published',?,?,?)")
    .run(longBody, timeMod.nowIso(), timeMod.nowIso(), timeMod.nowIso());

  const fts = searchMod.searchPosts("霍夫变换");
  assert.equal(fts.mode, "fts", "四字中文应走 FTS");
  assert.equal(fts.hits.length, 1);
  assert.equal(fts.hits[0].slug, "hough");

  const two = searchMod.searchPosts("变换");
  assert.equal(two.mode, "like", "二字中文应降级 LIKE");
  assert.equal(two.hits.length, 1, "降级后仍搜得到");

  // 只回摘要，绝不回传整篇正文（原实现单篇 13,871 B 全量回传）
  assert.ok([...fts.hits[0].excerpt].length <= 100);
});

test("草稿与软删除都不出现在搜索结果里", () => {
  const db = dbMod.getDb();
  db.prepare("UPDATE posts SET status = 'draft' WHERE slug = 'hough'").run();
  assert.equal(searchMod.searchPosts("霍夫变换").hits.length, 0, "草稿不可搜到");
  db.prepare("UPDATE posts SET status = 'published', deleted_at = ? WHERE slug = 'hough'").run(timeMod.nowIso());
  assert.equal(searchMod.searchPosts("霍夫变换").hits.length, 0, "回收站不可搜到");
  db.prepare("UPDATE posts SET deleted_at = NULL WHERE slug = 'hough'").run();
});

test("FTS 语法字符不会造成注入或异常", () => {
  for (const q of ['a" OR "b', "NEAR/2", "foo*", '"', "  ", "AND OR NOT"]) {
    assert.doesNotThrow(() => searchMod.searchPosts(q), "查询 " + JSON.stringify(q) + " 不应抛错");
  }
});

test("settings 默认值可用，写入后可读且缓存被失效", () => {
  settingsMod.invalidateSettingsCache();
  const d = settingsMod.getSettings();
  assert.equal(d.siteTitle, "flechazo's blog");
  assert.equal(d.commentEnabled, true);

  settingsMod.updateSettings({ siteTitle: "测试站点", commentEnabled: false });
  const after = settingsMod.getSettings();
  assert.equal(after.siteTitle, "测试站点", "写入后立即生效（缓存已失效）");
  assert.equal(after.commentEnabled, false, "布尔值以 1/0 存储并正确还原");
  assert.equal(settingsMod.getRawSetting("site_title"), "测试站点");
});

test("Umami 数值从本地 settings 读取，不再在渲染路径请求外部服务", () => {
  // 未同步时应显示占位符
  assert.equal(statsMod.getSiteStats().find((s) => s.label === "访问")?.value, "—");

  settingsMod.setStatValue("umami:total", "12345");
  assert.equal(statsMod.getSiteStats().find((s) => s.label === "访问")?.value, "1.2w", "12345 -> 1.2w");

  settingsMod.setStatValue("umami:path:/hough", "77");
  assert.equal(statsMod.getPageViews("/hough"), 77);
  assert.equal(statsMod.getPageViews("/nope"), null, "未同步的路径返回 null");

  const map = statsMod.getViewsMap();
  assert.equal(map.get("/hough"), 77, "首页批量取用一次查询");
});

test("cleanup", () => {
  dbMod.closeDb();
  fs.rmSync(TMP, { recursive: true, force: true });
});
