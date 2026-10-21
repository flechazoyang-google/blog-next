/**
 * 极简 Service Worker：只为「可安装」与基本离线体验服务。
 *
 * 策略：
 *   - 页面导航：网络优先，失败时回退缓存（离线也能看到上次内容）
 *   - 静态资源（/_next/static、图片）：缓存优先
 *   - /admin 与 /api：永不缓存（后台必须实时）
 */
const VERSION = "v1";
const CACHE = "blog-" + VERSION;

const PRECACHE = ["/", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理同源 GET
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // 后台与接口永不缓存
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) return;

  // 静态资源：缓存优先
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // 页面导航：网络优先，离线回退
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/offline.html"))
        )
    );
  }
});
