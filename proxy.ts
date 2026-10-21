import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "./next.config";

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

/**
 * CSP 在**运行期**下发。
 *
 * 为什么不放在 next.config 的 headers()：那里是构建期求值、结果固化成
 * routes-manifest.json，运行期改 CSP_MODE 无法生效（已实测确认）。
 * proxy 每个请求都执行，能读到当时的 CSP_MODE，才能做到"观察期 -> 强制"
 * 只改一个环境变量、重启即生效。
 *
 * 默认 report-only：全站大量内联 style，直接 enforce 有把界面打回原形的风险。
 */
function cspHeaders(pathname: string): Record<string, string> {
  const mode = process.env.CSP_MODE === "enforce" ? "enforce" : "report-only";
  const key = mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
  return { [key]: buildCsp() };
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const withCsp = (res: NextResponse) => {
    for (const [k, v] of Object.entries(cspHeaders(pathname))) res.headers.set(k, v);
    return res;
  };

  // 登录页与登录接口本身不拦
  if (pathname === "/admin/login" || pathname.startsWith("/api/auth/")) return withCsp(NextResponse.next());

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");
  if (!isAdminPage && !isAdminApi) return withCsp(NextResponse.next());

  const cookie = req.cookies.get(COOKIE_NAME)?.value ?? "";
  if (cookie && COOKIE_RE.test(cookie)) return withCsp(NextResponse.next());

  if (isAdminApi) {
    return withCsp(NextResponse.json({ error: "未登录或登录已过期", status: 401 }, { status: 401 }));
  }

  // 页面：带上来源路径，登录后能回到原处
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  if (pathname !== "/admin") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  /*
   * 现在 proxy 还负责下发 CSP，所以不能再只匹配后台路径。
   * 用负向匹配排除静态资源，避免给它们增加开销：
   *   - _next/static 下的 chunk 是内容寻址的，无需 CSP
   *   - images / favicon 等静态文件同理
   */
  matcher: [
    "/((?!_next/static|_next/image|images/|favicon|icon-|apple-touch-icon|avatar|sw.js|offline.html).*)",
  ],
};
