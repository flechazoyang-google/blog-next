"use client";
import { useState } from "react";

/** 头像：优先用 /avatar.jpg，加载失败自动退化为首字母 */
export function Avatar() {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="brand-avatar">F</div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="brand-avatar"
      src="/avatar.jpg"
      alt="flechazo"
      width={56}
      height={56}
      onError={() => setFailed(true)}
    />
  );
}
