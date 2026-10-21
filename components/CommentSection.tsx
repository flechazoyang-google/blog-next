"use client";
import { useEffect, useRef, useState } from "react";

/**
 * 评论区 —— 接入自建 Artalk（https://artalk.js.org）。
 *
 * 为什么换掉自研评论：
 *   原实现只有「提交 -> 待审 -> 后台通过」一条链路，没有回复、通知、
 *   反垃圾，后台也只能逐条点按钮。Artalk 这些都做好了，且数据在自己机器上。
 *
 * 关键点：
 *   1) 脚本异步加载，不阻塞首屏
 *   2) pageKey 用 slug（不用 id）：换库/重建时评论不会错位
 *   3) CSP 必须放行 artalk 域名，否则脚本加载了却不生效（见 next.config.ts）
 */
const ARTALK_SRC = process.env.NEXT_PUBLIC_ARTALK_SRC || "https://artalk.yghsite.cn";
const ARTALK_SITE = process.env.NEXT_PUBLIC_ARTALK_SITE || "flechazo blog";

type ArtalkInstance = { destroy: () => void; reload: () => void };

declare global {
  interface Window {
    Artalk?: new (opts: Record<string, unknown>) => ArtalkInstance;
  }
}

let loading: Promise<void> | null = null;

/** 只加载一次 Artalk 主脚本，多个组件共享 */
function loadArtalk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Artalk) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const sel = "script[data-artalk-src]";
    const existing = document.querySelector<HTMLScriptElement>(sel);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("artalk load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = ARTALK_SRC + "/dist/Artalk.js";
    s.async = true;
    s.dataset.artalkSrc = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("artalk load failed"));
    document.head.appendChild(s);
  });
  return loading;
}

export function CommentSection({ postId, pageKey }: { postId: number; pageKey: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ArtalkInstance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    loadArtalk()
      .then(() => {
        if (!alive || !hostRef.current || !window.Artalk) return;
        // 同容器重复挂载时先销毁旧实例，避免评论重复渲染
        instanceRef.current?.destroy();
        instanceRef.current = new window.Artalk({
          el: hostRef.current,
          server: ARTALK_SRC,
          site: ARTALK_SITE,
          pageKey,
          pageTitle: document.title,
          locale: "zh-CN",
          darkMode: "auto",
          imgUpload: false,
        });
      })
      .catch(() => {
        if (alive) setError("评论组件加载失败，请刷新页面重试");
      });

    return () => {
      alive = false;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [pageKey]);

  return (
    <section className="comments" data-post-id={postId}>
      {error ? (
        <div className="notice notice-error" style={{ marginBottom: 12 }}>{error}</div>
      ) : null}
      <div ref={hostRef} />
    </section>
  );
}
