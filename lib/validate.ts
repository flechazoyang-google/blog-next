/**
 * 极简校验层（替代 zod）。
 *
 * 为什么不用 zod：本机没有可用的 npm，装不了依赖；而这个项目需要的校验面很小
 * （字符串长度、枚举、slug 正则、URL 协议白名单、整数 id）。
 * 自实现的好处是零依赖、可测，且错误信息是中文、可直接回给前台。
 *
 * 约定：每个 parse 要么返回 { ok: true, value }，要么 { ok: false, error }。
 */

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

/** 显式错误，供 route 层统一转成 400 */
export class ValidationError extends Error {
  status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const fail = (error: string): Err => ({ ok: false, error });

export function str(
  v: unknown,
  opts: { field: string; min?: number; max?: number; trim?: boolean; required?: boolean; pattern?: RegExp; patternHint?: string } = { field: "字段" }
): Result<string> {
  if (v === undefined || v === null) {
    if (opts.required) return fail(opts.field + "不能为空");
    return { ok: true, value: "" };
  }
  if (typeof v !== "string") return fail(opts.field + "必须是字符串");
  const s = opts.trim === false ? v : v.trim();
  if (opts.required && !s) return fail(opts.field + "不能为空");
  const min = opts.min ?? 0;
  if (s.length < min) return fail(opts.field + "至少 " + min + " 个字符");
  if (opts.max !== undefined && s.length > opts.max) return fail(opts.field + "不能超过 " + opts.max + " 个字符");
  if (opts.pattern && s && !opts.pattern.test(s)) return fail(opts.field + (opts.patternHint ?? "格式不正确"));
  return { ok: true, value: s };
}

export function int(
  v: unknown,
  opts: { field: string; min?: number; max?: number; required?: boolean } = { field: "字段" }
): Result<number> {
  if (v === undefined || v === null || v === "") {
    if (opts.required) return fail(opts.field + "不能为空");
    return fail(opts.field + "必须是整数");
  }
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fail(opts.field + "必须是整数");
  if (opts.min !== undefined && n < opts.min) return fail(opts.field + "不能小于 " + opts.min);
  if (opts.max !== undefined && n > opts.max) return fail(opts.field + "不能大于 " + opts.max);
  return { ok: true, value: n };
}

export function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  opts: { field: string; fallback?: T }
): Result<T> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s && opts.fallback !== undefined) return { ok: true, value: opts.fallback };
  if (!s) return fail(opts.field + "不能为空");
  if (!(allowed as readonly string[]).includes(s)) {
    return fail(opts.field + "只能是 " + allowed.join(" / ") + " 之一");
  }
  return { ok: true, value: s as T };
}

/** slug：允许中日韩等 Unicode 文字 + 数字 + 连字符，禁止空格/斜杠/前导连字符 */
export const SLUG_RE = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,99}$/u;

export function slug(v: unknown, opts: { field?: string; required?: boolean } = {}): Result<string> {
  return str(v, {
    field: opts.field ?? "URL 路径",
    required: opts.required,
    max: 100,
    pattern: SLUG_RE,
    patternHint: "只能包含文字、数字和连字符，且不能以连字符开头",
  });
}

/**
 * 评论网址：只允许 http/https。
 * 原先只截断 200 字符，javascript:alert(1) 能入库，而 CommentSection 直接 href={c.url}。
 */
export function httpUrl(v: unknown, opts: { field?: string } = {}): Result<string> {
  const field = opts.field ?? "网址";
  const base = str(v, { field, max: 200 });
  if (!base.ok) return base;
  const s = base.value;
  if (!s) return { ok: true, value: "" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(field + "不是合法网址");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return fail(field + "只支持 http/https");
  return { ok: true, value: u.toString() };
}

export function email(v: unknown, opts: { field?: string } = {}): Result<string> {
  const field = opts.field ?? "邮箱";
  const base = str(v, { field, max: 120 });
  if (!base.ok) return base;
  const s = base.value;
  if (!s) return { ok: true, value: "" };
  // 刻意宽松：只要一段@一段.；够挡住明显垃圾，又不误伤
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return fail(field + "格式不正确");
  return { ok: true, value: s };
}

/** 字符串数组：兼容传入数组或逗号分隔串 */
export function strList(v: unknown, opts: { field: string; max?: number; maxItemLen?: number } = { field: "列表" }): Result<string[]> {
  let arr: string[];
  if (Array.isArray(v)) {
    arr = v.map((x) => String(x ?? "").trim());
  } else if (typeof v === "string") {
    arr = v.split(",").map((x) => x.trim());
  } else if (v === undefined || v === null) {
    arr = [];
  } else {
    return fail(opts.field + "必须是数组");
  }
  arr = arr.filter(Boolean);
  const max = opts.max ?? 20;
  if (arr.length > max) return fail(opts.field + "最多 " + max + " 项");
  const itemMax = opts.maxItemLen ?? 40;
  for (const item of arr) if (item.length > itemMax) return fail(opts.field + "单项不能超过 " + itemMax + " 字符");
  return { ok: true, value: [...new Set(arr)] };
}

/** 安全解析 DB 里的 JSON 数组字段：脏数据不再让页面 500（原 JSON.parse 无保护） */
export function safeJsonArray(s: unknown): string[] {
  if (Array.isArray(s)) return s.map((x) => String(x));
  if (typeof s !== "string" || !s.trim()) return [];
  try {
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x));
  } catch {
    return [];
  }
}

/** 取校验结果或抛 400：省掉每个 route 里的 if (!r.ok) throw 样板 */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new ValidationError(r.error);
  return r.value;
}

/** 把多条校验结果合成一条错误信息 */
export function firstError(results: Result<unknown>[]): string | null {
  for (const r of results) if (!r.ok) return r.error;
  return null;
}
