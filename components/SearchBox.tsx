"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** 侧栏搜索框：回车或点按钮跳转 /search?q= */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kw = q.trim();
    if (kw) router.push("/search?q=" + encodeURIComponent(kw));
  };

  return (
    <form className="search-box" onSubmit={submit} role="search">
      <svg className="search-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden>
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索文章…"
        aria-label="搜索文章"
      />
    </form>
  );
}
