"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 滚动行为修正：
 *  1. 进入新页面（路径变化）时，强制回到顶部 —— 不要在页面中段停留
 *  2. 浏览器后退时，由浏览器原生恢复位置，不额外干预
 *
 * 反直觉的点：Next 默认会给 <html> 加 scroll-behavior:smooth，
 * 于是"回到顶部"变成了肉眼可见的滚动动画，这才是用户抱怨"自动滑动"的根源。
 */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    // 路径变化 -> 立即跳顶（用 auto，不走平滑滚动）
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
