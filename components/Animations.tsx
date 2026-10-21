"use client";
import { useEffect } from "react";

/** 进场动画 + 卡片光斑跟随 */
export function Animations() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".slide-up").forEach((el) => io.observe(el));

    const onMove = (ev: MouseEvent) => {
      const target = (ev.target as HTMLElement).closest(".post-card") as HTMLElement | null;
      if (!target) return;
      const r = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${ev.clientX - r.left}px`);
      target.style.setProperty("--my", `${ev.clientY - r.top}px`);
    };
    document.addEventListener("mousemove", onMove);
    return () => {
      io.disconnect();
      document.removeEventListener("mousemove", onMove);
    };
  }, []);
  return null;
}
