import { test } from "node:test";
import assert from "node:assert/strict";
import { detectImage, looksLikeMarkup, buildRelativePath, safeJoin, imageSize, MAX_UPLOAD_BYTES } from "../lib/upload.ts";

// 真实图片头的构造（只造头部，足以判定签名）
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8), // IHDR length + type
  Buffer.from([0, 0, 0x01, 0x00, 0, 0, 0x00, 0x80]), // 256 x 128
  Buffer.alloc(20),
]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.from([0x10, 0x00, 0x08, 0x00]), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ", "latin1"), Buffer.alloc(30)]);

test("A1 核心：PNG 字节永远拿到 .png，与客户端文件名无关", () => {
  const d = detectImage(png);
  assert.equal(d?.ext, ".png");
  assert.equal(d?.mime, "image/png");
});

test("A1 回归：HTML 伪装成 image/png 被拒", () => {
  const evil = Buffer.from("<!DOCTYPE html><script>alert(1)</script>", "utf8");
  assert.equal(detectImage(evil), null, "非图片签名必须识别不出");
  assert.equal(looksLikeMarkup(evil), true, "应能识别为标记语言，便于给出准确报错");
});

test("A1 回归：SVG 被拒（可携带 script）", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");
  assert.equal(detectImage(svg), null);
  assert.equal(looksLikeMarkup(svg), true);
});

test("A1 回归：PHP / 可执行文件被拒", () => {
  assert.equal(detectImage(Buffer.from("<?php system($_GET['c']); ?>", "utf8")), null);
  assert.equal(detectImage(Buffer.from("MZ\x90\x00\x03", "latin1")), null);
  assert.equal(detectImage(Buffer.alloc(0)), null, "空文件不崩");
  assert.equal(detectImage(Buffer.from([0x89, 0x50])), null, "截断的 PNG 不误判");
});

test("真实 JPEG / GIF / WEBP 各自识别出正确扩展名", () => {
  assert.equal(detectImage(jpeg)?.ext, ".jpg");
  assert.equal(detectImage(gif)?.ext, ".gif");
  assert.equal(detectImage(webp)?.ext, ".webp");
});

test("落盘路径由服务端生成，且不含任何客户端输入", () => {
  const rel = buildRelativePath(".png", new Date("2026-10-21T10:00:00Z"));
  assert.match(rel, /^2026\/10\/\d+-[0-9a-f]{8}\.png$/, "应为 年/月/时间戳-随机.扩展名");
  assert.ok(!rel.includes(".."), "不含路径穿越");
  assert.notEqual(buildRelativePath(".png"), buildRelativePath(".png"), "两次生成不重名");
});

test("safeJoin 挡住路径穿越", () => {
  const base = "C:/var/www/blog-images";
  assert.ok(safeJoin(base, "2026/10/a.png").includes("a.png"));
  assert.throws(() => safeJoin(base, "../../etc/passwd"), /path traversal/);
  assert.throws(() => safeJoin(base, "..\\..\\windows\\system32\\x.dll"), /path traversal/);
});

test("尺寸解析：PNG 头部读出宽高", () => {
  assert.deepEqual(imageSize(png, "image/png"), { width: 256, height: 128 });
  assert.deepEqual(imageSize(Buffer.from("GIF89a", "latin1"), "image/gif"), null, "长度不足返回 null 而非抛错");
});

test("上传上限为 8MB（与 nginx 12m 留余量）", () => {
  assert.equal(MAX_UPLOAD_BYTES, 8 * 1024 * 1024);
});
