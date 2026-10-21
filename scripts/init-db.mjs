#!/usr/bin/env node
/**
 * 初始化数据库（建表 + 创建管理员）。
 *
 * 注意：建表逻辑**不再**在这个文件里重复写一遍。
 * 方案 C13 之前，这里和 lib/db.ts 各有一份 DDL，改一处忘另一处就会漂移。
 * 现在统一走 lib/migrations.ts（唯一事实来源）。
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { migrate, migrationNames, currentVersion } from "../lib/migrations.ts";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "blog.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const res = migrate(db);
console.log("迁移已应用：" + (res.applied.length ? res.applied.join(", ") : "（无新增）"));
console.log("当前版本：" + currentVersion(db) + "（共 " + migrationNames().length + " 条）");

const existing = db.prepare("SELECT COUNT(*) c FROM users").get().c;
if (existing > 0) {
  console.log("已有管理员账号，跳过创建");
  db.close();
  process.exit(0);
}

const username = process.env.ADMIN_USER || "flechazo";
let password = process.env.ADMIN_PASS;
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("设置管理员密码（至少 12 位）: ");
  rl.close();
}
if (!password || password.length < 12) {
  console.error("密码至少 12 位");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
db.prepare("INSERT INTO users (username, password_hash, password_updated_at) VALUES (?, ?, ?)")
  .run(username, hash, new Date().toISOString());
console.log("已创建管理员：" + username);
console.log("提示：登录后请立刻在 设置 → 两步验证 里启用 TOTP 并保存恢复码。");
db.close();
