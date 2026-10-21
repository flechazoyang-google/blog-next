/**
 * 取真实客户端 IP（方案 A3）。
 *
 * 原实现取 x-forwarded-for 的第一段，而 nginx 配的是 proxy_add_x_forwarded_for ——
 * 它把真实 IP **追加在客户端自报值之后**，所以第一段完全由攻击者控制，
 * 换个头就能绕过登录与评论限流。
 *
 * 优先级：
 *   1) x-real-ip —— 本 nginx 用 $remote_addr 设置，客户端无法伪造
 *   2) x-forwarded-for 的**最后一段** —— 由最近的可信代理追加
 *   3) "unknown"
 */
function norm(ip: string): string {
  const s = ip.trim();
  if (s.startsWith("::ffff:")) return s.slice(7); // IPv4-mapped IPv6
  return s;
}

export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return norm(real);
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return norm(parts[parts.length - 1]);
  }
  return "unknown";
}
