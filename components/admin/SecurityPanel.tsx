"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type SessionInfo = {
  id: string; userAgent: string; ip: string; createdAt: string;
  lastSeenAt: string | null; expiresAt: string; current: boolean;
  createdAtLabel: string; lastSeenLabel: string;
};

const box = {
  border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)",
  padding: 20, marginBottom: 18,
} as const;

function Btn({ children, onClick, busy, primary, danger }: {
  children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean;
}) {
  return (
    <button
      className={"btn btn-sm" + (primary ? " btn-primary" : "")}
      disabled={busy}
      onClick={onClick}
      style={danger ? { borderColor: "#e5484d", color: "#e5484d" } : undefined}
    >{children}</button>
  );
}

export function SecurityPanel({ username, totpEnabled, recoveryRemaining, sessions }: {
  username: string; totpEnabled: boolean; recoveryRemaining: number; sessions: SessionInfo[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // TOTP 绑定流程
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  // 改密
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const clear = () => { setMsg(""); setErr(""); };

  const start = async () => {
    clear(); setBusy(true);
    const res = await fetch("/api/admin/totp/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totp: totpCode }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setSecret(d.secret); setUri(d.uri); setStep("verify"); }
    else setErr(d.error || "生成失败");
  };

  const confirm = async () => {
    clear(); setBusy(true);
    const res = await fetch("/api/admin/totp/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setStep("idle"); setCode(""); setRecoveryCodes(d.recoveryCodes || []);
      setMsg("两步验证已启用，请立刻保存下面的恢复码");
      router.refresh();
    } else setErr(d.error || "验证失败");
  };

  const disable = async () => {
    clear(); setBusy(true);
    const res = await fetch("/api/admin/totp/disable", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totp: totpCode }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg("两步验证已关闭"); router.refresh(); }
    else setErr(d.status === 428 ? "需要先输入当前验证码" : d.error || "操作失败");
  };

  const regenRecovery = async () => {
    clear(); setBusy(true);
    const res = await fetch("/api/admin/recovery-codes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totp: totpCode }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setRecoveryCodes(d.codes || []); setMsg("已生成新的恢复码，旧码全部作废"); router.refresh(); }
    else setErr(d.status === 428 ? "需要先输入当前验证码" : d.error || "操作失败");
  };

  const revoke = async (id: string, all = false) => {
    clear(); setBusy(true);
    const res = await fetch("/api/admin/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { action: "revoke_all" } : { action: "revoke", id }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      if (all) { window.location.href = "/admin/login"; return; }
      setMsg("已撤销该设备"); router.refresh();
    } else setErr(d.error || "操作失败");
  };

  const changePw = async () => {
    clear();
    if (newPassword.length < 12) { setErr("新密码至少 12 位"); return; }
    setBusy(true);
    const res = await fetch("/api/admin/password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword, newPassword, totp: totpCode }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg("密码已修改，所有设备需重新登录");
      setTimeout(() => { window.location.href = "/admin/login"; }, 1200);
    } else setErr(d.status === 428 ? "需要输入两步验证码" : d.error || "修改失败");
  };

  const needStepUpHint = totpEnabled ? (
    <div className="field" style={{ maxWidth: 220 }}>
      <label>当前两步验证码（敏感操作需要）</label>
      <input className="input" value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
             inputMode="numeric" maxLength={12} placeholder="6 位数字或恢复码" />
    </div>
  ) : null;

  return (
    <>
      <section style={box}>
        <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 4px", fontWeight: 600 }}>账号</h2>
        <p style={{ fontSize: ".85rem", color: "var(--text-p3)", margin: "0 0 10px" }}>当前账号：{username}</p>
        {msg ? <div className="notice notice-ok">{msg}</div> : null}
        {err ? <div className="notice notice-error">{err}</div> : null}
        {needStepUpHint}
      </section>

      <section style={box}>
        <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 4px", fontWeight: 600 }}>两步验证（TOTP）</h2>
        <p style={{ fontSize: ".85rem", color: "var(--text-p3)", margin: "0 0 12px" }}>
          {totpEnabled
            ? "已启用。关闭它需要输入当前验证码 —— 这一点是刻意的：即使 Cookie 被窃也无法单方面关掉 2FA。"
            : "未启用。建议开启；开启后会生成 8 个恢复码，验证器丢失时可用来登录。"}
        </p>

        {step === "idle" && !totpEnabled ? <Btn onClick={start} busy={busy} primary>启用</Btn> : null}
        {step === "idle" && totpEnabled ? <Btn onClick={disable} busy={busy} danger>关闭两步验证</Btn> : null}

        {step === "verify" ? (
          <div>
            <p style={{ fontSize: ".85rem", color: "var(--text-p2)", marginBottom: 8 }}>
              1. 在验证器 App 里添加账号（手动输入下面的密钥）
            </p>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: ".8rem", background: "var(--bg-subtle)",
              padding: "10px 12px", borderRadius: 8, wordBreak: "break-all", marginBottom: 8,
              border: "1px solid var(--border)",
            }}>{secret}</div>
            <p style={{ fontSize: ".74rem", color: "var(--text-p4)", marginBottom: 12, wordBreak: "break-all" }}>{uri}</p>
            <p style={{ fontSize: ".85rem", color: "var(--text-p2)", marginBottom: 8 }}>2. 输入 App 显示的 6 位验证码</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)}
                     inputMode="numeric" maxLength={6} style={{ maxWidth: 140 }} />
              <Btn onClick={confirm} busy={busy} primary>确认</Btn>
            </div>
          </div>
        ) : null}

        {totpEnabled ? (
          <div style={{ marginTop: 14, fontSize: ".82rem", color: "var(--text-p3)" }}>
            剩余恢复码：<b>{recoveryRemaining}</b>
            <div style={{ marginTop: 8 }}><Btn onClick={regenRecovery} busy={busy}>重新生成恢复码</Btn></div>
          </div>
        ) : null}

        {recoveryCodes.length ? (
          <div style={{ marginTop: 14 }}>
            <div className="notice notice-ok" style={{ marginBottom: 8 }}>
              这些恢复码只显示这一次，请立即保存到密码管理器。
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
              fontFamily: "var(--font-mono)", fontSize: ".82rem", color: "var(--text-p1)",
              background: "var(--bg-subtle)", padding: 12, borderRadius: 8, border: "1px solid var(--border)",
            }}>
              {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
          </div>
        ) : null}
      </section>

      <section style={box}>
        <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 4px", fontWeight: 600 }}>已登录设备</h2>
        <p style={{ fontSize: ".82rem", color: "var(--text-p3)", margin: "0 0 12px" }}>
          库里只存会话 token 的 SHA-256，所以这里显示的是哈希前缀，而非 token 本身。
        </p>
        {sessions.map((s) => (
          <div key={s.id} style={{
            display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
            padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: ".82rem",
          }}>
            <span style={{ flex: 1, minWidth: 200, color: "var(--text-p2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.current ? "🟢 " : ""}{s.userAgent}
            </span>
            <span style={{ color: "var(--text-p4)", fontSize: ".76rem" }}>{s.ip}</span>
            <span style={{ color: "var(--text-p4)", fontSize: ".76rem" }}>最近 {s.lastSeenLabel}</span>
            {s.current ? <span style={{ fontSize: ".74rem", color: "var(--text-p4)" }}>当前</span>
              : <Btn onClick={() => revoke(s.id)} busy={busy}>撤销</Btn>}
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <Btn onClick={() => revoke("", true)} busy={busy} danger>退出所有设备</Btn>
        </div>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 4px", fontWeight: 600 }}>修改密码</h2>
        <p style={{ fontSize: ".82rem", color: "var(--text-p3)", margin: "0 0 12px" }}>
          至少 12 位。修改成功后所有会话（含当前）都会失效，需要重新登录。
        </p>
        <div className="field">
          <label>当前密码</label>
          <input className="input" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="field">
          <label>新密码</label>
          <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <Btn onClick={changePw} busy={busy} primary>修改密码</Btn>
      </section>
    </>
  );
}
