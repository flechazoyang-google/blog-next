"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, totp }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setErr(d.error || "登录失败");
      if (d.needTotp) setNeedTotp(true);
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "12vh auto", padding: "0 24px" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", marginBottom: 8, color: "var(--text-p0)" }}>
        后台登录
      </h1>
      <p style={{ color: "var(--text-p4)", fontSize: ".85rem", marginBottom: 28 }}>blog.yghsite.cn</p>

      <form onSubmit={submit}>
        {err ? <div className="notice notice-error">{err}</div> : null}
        <div className="field">
          <label>账号</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </div>
        <div className="field">
          <label>密码</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {needTotp ? (
          <div className="field">
            <label>两步验证码</label>
            <input className="input" value={totp} onChange={(e) => setTotp(e.target.value)}
                   inputMode="numeric" maxLength={6} placeholder="6 位数字" autoFocus required />
          </div>
        ) : null}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
