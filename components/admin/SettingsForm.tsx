"use client";
import { useState } from "react";
import type { Settings } from "@/lib/settings";

/**
 * 站点设置表单（C4）。
 * settings 表此前建了却 0 处引用，站名/描述/页脚都硬编码在 layout.tsx 里。
 */
export function SettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState<Settings>(initial);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setMsg(""); setErr("");
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg("已保存"); }
    else setErr(d.error || "保存失败");
  };

  const field = (label: string, key: keyof Settings, opts: { multiline?: boolean; placeholder?: string } = {}) => (
    <div className="field" key={String(key)}>
      <label>{label}</label>
      {opts.multiline ? (
        <textarea className="textarea" value={String(form[key] ?? "")} placeholder={opts.placeholder}
                  onChange={(e) => set(key, e.target.value as never)} style={{ minHeight: 90 }} />
      ) : (
        <input className="input" value={String(form[key] ?? "")} placeholder={opts.placeholder}
               onChange={(e) => set(key, e.target.value as never)} />
      )}
    </div>
  );

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)", padding: 20, marginBottom: 18 }}>
      <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 4px", fontWeight: 600 }}>站点</h2>
      <p style={{ fontSize: ".82rem", color: "var(--text-p3)", margin: "0 0 14px" }}>
        这些值取代了原先硬编码在 layout / RSS / sitemap 里的文案。
      </p>

      {msg ? <div className="notice notice-ok">{msg}</div> : null}
      {err ? <div className="notice notice-error">{err}</div> : null}

      {field("站点标题", "siteTitle", { placeholder: "flechazo's blog" })}
      {field("副标题", "siteSubtitle", { placeholder: "扬帆起航" })}
      {field("站点描述（用于 SEO / RSS）", "siteDescription", { multiline: true })}
      {field("作者", "author")}
      {field("页脚文字", "footerText", { placeholder: "© 2026 ..." })}
      {field("备案号", "icp", { placeholder: "陕ICP备xxxxxxx号" })}
      {field("友链（每行 一个，格式：名称|链接）", "friendLinks", { multiline: true, placeholder: "示例|https://example.com" })}
      {field("展示时区", "timezone", { placeholder: "Asia/Shanghai" })}

      <div style={{ display: "flex", gap: 20, margin: "12px 0 4px" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".86rem", color: "var(--text-p2)" }}>
          <input type="checkbox" checked={form.commentEnabled} onChange={(e) => set("commentEnabled", e.target.checked)} />
          开启评论
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".86rem", color: "var(--text-p2)" }}>
          <input type="checkbox" checked={form.rssEnabled} onChange={(e) => set("rssEnabled", e.target.checked)} />
          开放 RSS
        </label>
      </div>

      <button className="btn btn-primary" disabled={busy} onClick={save} style={{ marginTop: 12 }}>
        {busy ? "保存中…" : "保存设置"}
      </button>
    </section>
  );
}
