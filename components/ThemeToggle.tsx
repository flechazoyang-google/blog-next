"use client";
import { useEffect, useState } from "react";

/**
 * 亮/暗主题切换（2026-10-23）。
 *
 * 三种状态：
 *   system —— 跟随系统（首次访问的默认值，不写 localStorage）
 *   light  —— 手动白天
 *   dark   —— 手动夜间
 *
 * 存储：localStorage["blog-theme"]，只存 light/dark。
 * 没有这个键 = 跟随系统，由 CSS 的 prefers-color-scheme 兜底。
 *
 * 为什么写在 html 的 data-theme 上：
 *   CSS 里 :root[data-theme="dark"] 覆盖变量，
 *   @media (prefers-color-scheme: dark) 只对"未手动选择"的根元素生效，
 *   两者互斥、不会打架。
 *
 * 防闪烁：layout 里有一段同步内联脚本，在首屏绘制前就把 data-theme 打上，
 * 这里的 useEffect 只负责后续交互与图标同步。
 */

type Theme = "light" | "dark";
const STORAGE_KEY = "blog-theme";

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  // 同步移动端浏览器地址栏配色
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#141414" : "#fffefc");
}

export function ThemeToggle() {
  // 初值取 null，避免 SSR 与客户端不一致造成的图标跳变
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") {
      setTheme(attr);
      return;
    }
    // 没手动选过：看系统当前是什么
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setTheme(mq.matches ? "dark" : "light");
  }, []);

  // 跟随系统时，系统变了要跟着变（用户没手动选过才跟）
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return; // 已手动选择，不跟随
      const next: Theme = e.matches ? "dark" : "light";
      setTheme(next);
      apply(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* 隐私模式忽略 */ }
    apply(next);
  };

  // 首帧未确定主题时占位，保持布局稳定
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={isDark ? "切换到白天模式" : "切换到夜间模式"}
      title={isDark ? "切换到白天模式" : "切换到夜间模式"}
      onClick={toggle}
    >
      {theme === null ? (
        <span className="theme-toggle-ph" aria-hidden />
      ) : isDark ? (
        // 太阳：点击回到白天
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        // 月亮：点击进入夜间
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M20.5 14.3A8.6 8.6 0 1 1 9.7 3.5a6.9 6.9 0 0 0 10.8 10.8z"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
