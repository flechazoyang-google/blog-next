"use client";
import { useEffect, useState } from "react";

type C = { id: number; author: string; url: string; content: string; created_at: string; parent_id: number | null };

export function CommentSection({ postId }: { postId: number }) {
  const [comments, setComments] = useState<C[]>([]);
  const [author, setAuthor] = useState("");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState(""); // 蜜罐
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch(`/api/comments?post_id=${postId}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setComments(d))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    try {
      const saved = JSON.parse(localStorage.getItem("commenter") || "{}");
      if (saved.author) setAuthor(saved.author);
      if (saved.email) setEmail(saved.email);
      if (saved.url) setUrl(saved.url);
    } catch {}
  }, [postId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(""); setErr("");
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, author, email, url, content, website }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setContent("");
      setMsg(data.message || "已提交，待审核");
      localStorage.setItem("commenter", JSON.stringify({ author, email, url }));
    } else {
      setErr(data.error || "提交失败");
    }
  };

  return (
    <section className="comments">
      <h2 className="comments-title">评论{comments.length ? ` (${comments.length})` : ""}</h2>

      {comments.length === 0 ? (
        <div className="empty" style={{ padding: "20px 0" }}>还没有评论，来说点什么吧</div>
      ) : comments.map((c) => (
        <div key={c.id} className="comment">
          <div className="comment-avatar">{c.author.slice(0, 1).toUpperCase()}</div>
          <div className="comment-body">
            <div className="comment-head">
              {c.url ? <a className="comment-author" href={c.url} target="_blank" rel="nofollow noopener ugc">{c.author}</a>
                     : <span className="comment-author">{c.author}</span>}
              <span className="comment-date">{c.created_at.slice(0, 10)}</span>
            </div>
            <div className="comment-text">{c.content}</div>
          </div>
        </div>
      ))}

      <form onSubmit={submit} style={{ marginTop: 28 }}>
        {msg ? <div className="notice notice-ok">{msg}</div> : null}
        {err ? <div className="notice notice-error">{err}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>昵称 *</label>
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} required maxLength={40} />
          </div>
          <div className="field">
            <label>邮箱</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          </div>
          <div className="field">
            <label>网站</label>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={200} />
          </div>
        </div>

        <div className="field">
          <label>内容 *</label>
          <textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} required maxLength={2000} />
        </div>

        {/* 蜜罐：对用户隐藏 */}
        <input
          tabIndex={-1} autoComplete="off" value={website}
          onChange={(e) => setWebsite(e.target.value)}
          style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0 }}
          aria-hidden
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-primary" disabled={busy}>{busy ? "提交中…" : "提交评论"}</button>
          <span style={{ fontSize: ".78rem", color: "var(--text-p4)" }}>提交后需审核通过才会显示</span>
        </div>
      </form>
    </section>
  );
}
