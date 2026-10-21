import { NextResponse, type NextRequest } from "next/server";

/**
 * 粗粒度门禁（方案 A6 / P0-4）。
 *
 * 为什么需要它：原实现把 `if (!(await currentUser()))` 抄在每个页面和每个 API 里，
 * 新增一个路由忘记写这行就等于**静默公开**。这里做一层统一兜底。
 *
 * 为什么它不能是唯一的一层：
 *   - 这里只检查 Cookie 是否存在，不查库（省掉每个静态请求一次 SQLite 打开）
 *   - 真正的判定在 lib/guards.ts 的 requireAdmin() 里
 * 两层互补：忘了写守卫 -> proxy 挡住；proxy 失效 -> 守卫挡住。
 *
 * 注：Next 16 已把 middleware.ts 改名为 proxy.ts（旧名弃用），
 *     且 proxy 固定运行在 Node.js runtime。
 */

const COOKIE_NAME = "blog_session";
const COOKIE_RE = /^[0-9a-f]{64}$/; // 32 字节 hex；格式不对直接当未登录

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 登录页与登录接口本身不拦
  if (pathname === "/admin/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value ?? "";
  if (cookie && COOKIE_RE.test(cookie)) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json({ error: "未登录或登录已过期", status: 401 }, { status: 401 });
  }

  // 页面：带上来源路径，登录后能回到原处
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  if (pathname !== "/admin") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // 只跑在后台相关路径上，避免给全部静态资源增加开销
  matcher: ["/admin/:path*", "/admin", "/api/admin/:path*", "/api/auth/:path*"],
};
