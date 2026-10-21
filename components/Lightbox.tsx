"use client";
import { useEffect } from "react";

/** 点击正文图片放大查看 */
export function Lightbox() {
  useEffect(() => {
    let dlg = document.querySelector("dialog.lightbox") as HTMLDialogElement | null;
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "lightbox";
      const img = document.createElement("img");
      dlg.appendChild(img);
      document.body.appendChild(dlg);
      dlg.addEventListener("click", () => dlg!.close());
    }
    const onClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest(".prose img") as HTMLImageElement | null;
      if (!img || !dlg) return;
      const big = dlg.querySelector("img")!;
      big.src = img.src;
      big.alt = img.alt;
      dlg.showModal();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
