"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState<"idle" | "verify">(enabled ? "idle" : "idle");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const start = async () => {
    setErr(""); setMsg("");
    const res = await fetch("/api/admin/totp/start", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setSecret(d.secret); setUri(d.uri); setStep("verify"); }
    else setErr(d.error || "生成失败");
  };

  const confirm = async () => {
    setErr("");
    const res = await fetch("/api/admin/totp/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setMsg("两步验证已启用"); setStep("idle"); router.refresh(); }
    else setErr(d.error || "验证失败");
  };

  const disable = async () => {
    const res = await fetch("/api/admin/totp/disable", { method: "POST" });
    if (res.ok) { setMsg("两步验证已关闭"); router.refresh(); }
  };

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)", padding: 20 }}>
      <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 6px", fontWeight: 600 }}>两步验证（TOTP）</h2>
      <p style={{ fontSize: ".85rem", color: "var(--text-p3)", margin: "0 0 14px" }}>
        {enabled ? "已启用。登录时需要输入验证器 App 的 6 位验证码。" : "未启用。强烈建议开启，保护后台安全。"}
      </p>

      {msg ? <div className="notice notice-ok">{msg}</div> : null}
      {err ? <div className="notice notice-error">{err}</div> : null}

      {step === "idle" && !enabled ? (
        <button className="btn btn-primary btn-sm" onClick={start}>启用</button>
      ) : null}

      {step === "idle" && enabled ? (
        <button className="btn btn-sm" onClick={disable}>关闭两步验证</button>
      ) : null}

      {step === "verify" ? (
        <div>
          <p style={{ fontSize: ".85rem", color: "var(--text-p2)", marginBottom: 8 }}>
            1. 在验证器 App（如 Google Authenticator、Microsoft Authenticator）中添加账号
          </p>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: ".8rem", background: "var(--bg-subtle)",
            padding: "10px 12px", borderRadius: 8, wordBreak: "break-all", marginBottom: 12,
            border: "1px solid var(--border)",
          }}>{secret}</div>
          <p style={{ fontSize: ".8rem", color: "var(--text-p4)", marginBottom: 14, wordBreak: "break-all" }}>{uri}</p>
          <p style={{ fontSize: ".85rem", color: "var(--text-p2)", marginBottom: 8 }}>2. 输入 App 显示的 6 位验证码</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)}
                   inputMode="numeric" maxLength={6} style={{ maxWidth: 140 }} />
            <button className="btn btn-primary btn-sm" onClick={confirm}>确认</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
