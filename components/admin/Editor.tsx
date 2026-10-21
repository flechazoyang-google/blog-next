"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Initial = {
  id?: number; type?: string; title?: string; slug?: string; content?: string;
  status?: string; categories?: string[]; tags?: string[]; published_at?: string;
};

export function Editor({ initial, mode }: { initial?: Initial; mode: "new" | "edit" }) {
  const [type, setType] = useState(initial?.type || "post");
  const [title, setTitle] = useState(initial?.title || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [content, setContent] = useState(initial?.content || "");
  const [cats, setCats] = useState((initial?.categories || []).join(", "));
  const [tags, setTags] = useState((initial?.tags || []).join(", "));
  const [status, setStatus] = useState(initial?.status || "draft");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [dirty, setDirty] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 离开提醒
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const mark = () => setDirty(true);

  const insert = (text: string, wrap = false) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = content.slice(s, e);
    const next = wrap
      ? content.slice(0, s) + text + sel + text + content.slice(e)
      : content.slice(0, s) + text + sel + content.slice(e);
    setContent(next);
    mark();
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + text.length + (wrap ? sel.length : 0);
    });
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    setMsg("上传中…");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setMsg("");
    if (res.ok) {
      insert(`![](${d.url})\n`);
    } else {
      setErr(d.error || "上传失败");
    }
  };

  const save = async (nextStatus?: string) => {
    const st = nextStatus || status;
    setBusy(true); setErr(""); setMsg("");
    const payload = {
      type, title, slug: slug || undefined, content,
      categories: cats.split(",").map((x) => x.trim()).filter(Boolean),
      tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
      status: st,
    };
    const url = mode === "new" ? "/api/admin/posts" : `/api/admin/posts/${initial?.id}`;
    const res = await fetch(url, {
      method: mode === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setDirty(false);
      setStatus(st);
      setMsg(st === "published" ? "已发布" : "已保存为草稿");
      if (mode === "new" && d.id) {
        router.push(`/admin/edit/${d.id}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } else {
      setErr(d.error || "保存失败");
    }
  };

  const togglePreview = async () => {
    if (!preview) {
      const res = await fetch("/api/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const d = await res.json().catch(() => ({ html: "" }));
      setPreviewHtml(d.html || "");
      setPreview(true);
    } else setPreview(false);
  };

  const isShuo = type === "shuoshuo";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select className="input" value={type} onChange={(e) => { setType(e.target.value); mark(); }}
                style={{ width: 110, padding: "6px 10px" }}>
          <option value="post">文章</option>
          <option value="page">页面</option>
          <option value="shuoshuo">说说</option>
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={togglePreview}>{preview ? "编辑" : "预览"}</button>
      </div>

      {msg ? <div className="notice notice-ok">{msg}</div> : null}
      {err ? <div className="notice notice-error">{err}</div> : null}

      {!isShuo ? (
        <div className="field">
          <label>标题</label>
          <input className="input" value={title} onChange={(e) => { setTitle(e.target.value); mark(); }}
                 placeholder="文章标题" style={{ fontSize: "1.05rem", fontFamily: "var(--font-serif)" }} />
        </div>
      ) : null}

      {!isShuo && mode === "edit" ? (
        <div className="field">
          <label>URL 路径</label>
          <input className="input" value={slug} onChange={(e) => { setSlug(e.target.value); mark(); }} />
        </div>
      ) : null}

      {/* 工具栏 */}
      <div style={{
        display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8,
        padding: 6, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-subtle)",
      }}>
        {[
          { l: "H2", v: "## ", w: false },
          { l: "H3", v: "### ", w: false },
          { l: "粗体", v: "**", w: true },
          { l: "斜体", v: "*", w: true },
          { l: "代码", v: "`", w: true },
          { l: "引用", v: "> ", w: false },
          { l: "列表", v: "- ", w: false },
          { l: "链接", v: "[文本](url)", w: false },
          { l: "分隔线", v: "\n---\n", w: false },
        ].map((b) => (
          <button key={b.l} type="button" className="btn btn-sm" onClick={() => insert(b.v, b.w)}
                  style={{ padding: "3px 9px", fontSize: ".78rem" }}>{b.l}</button>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}
                style={{ padding: "3px 9px", fontSize: ".78rem" }}>图片</button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </div>

      {preview ? (
        <div className="prose" style={{
          minHeight: 320, padding: "16px 18px", border: "1px solid var(--border)",
          borderRadius: 12, background: "var(--card-bg)",
        }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
      ) : (
        <textarea
          ref={taRef}
          className="textarea"
          value={content}
          onChange={(e) => { setContent(e.target.value); mark(); }}
          placeholder={isShuo ? "写点什么…" : "支持 Markdown 语法，可直接粘贴图片"}
          style={{ minHeight: isShuo ? 140 : 420, fontFamily: "var(--font-mono)", fontSize: ".9rem", lineHeight: 1.7 }}
        />
      )}

      {!isShuo ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="field">
            <label>分类（逗号分隔）</label>
            <input className="input" value={cats} onChange={(e) => { setCats(e.target.value); mark(); }} placeholder="学习, AI" />
          </div>
          <div className="field">
            <label>标签（逗号分隔）</label>
            <input className="input" value={tags} onChange={(e) => { setTags(e.target.value); mark(); }} placeholder="部署, 工具" />
          </div>
        </div>
      ) : null}

      {/* 手机端底部固定操作栏 */}
      <div style={{
        position: "sticky", bottom: 0, marginTop: 20, padding: "12px 0",
        background: "var(--bg-subtle)", borderTop: "1px solid var(--border)",
        display: "flex", gap: 10, justifyContent: "flex-end",
      }}>
        <button className="btn" disabled={busy} onClick={() => save("draft")}>存草稿</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => save("published")}>
          {busy ? "保存中…" : status === "published" ? "更新" : "发布"}
        </button>
      </div>
    </div>
  );
}
