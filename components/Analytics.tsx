/**
 * Umami 统计脚本。
 *
 * 为什么不用 next/script：
 *   next/script 在 afterInteractive 策略下，服务端只输出 <link rel="preload">，
 *   真正的 <script> 由客户端 useEffect 在 hydration 后才插入。对跨域脚本来说，
 *   浏览器会报「preload 了但几秒内没用到」的 warning，而且统计要等 hydration
 *   完成才开始 —— 首屏快速跳出会被漏统计。
 *
 * 这里用原生 <script defer>：
 *   - 服务端直出执行标签，没有 preload/执行 的时间差，warning 消失
 *   - defer 保证不阻塞解析，效果等同于 afterInteractive
 *   - 域名固定、跨域加载，不需要 Next 的加载管理
 *
 * 通过环境变量启用，未配置时完全不输出（避免开发环境报错）。
 */
const DEFAULT_SRC = "https://umami.yghsite.cn/script.js";

export function Analytics() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC || DEFAULT_SRC;
  const id = process.env.NEXT_PUBLIC_UMAMI_ID;
  if (!src || !id) return null;

  return (
    <script
      defer
      src={src}
      data-website-id={id}
      // 让浏览器在解析到时就发起请求，而不是等 hydration
      data-auto-track="true"
    />
  );
}
