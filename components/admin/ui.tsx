import type { ReactNode } from "react";

export function Card({ title, desc, children }: { title?: string; desc?: string; children: ReactNode }) {
  return (
    <section style={{
      border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)",
      padding: 20, marginBottom: 18,
    }}>
      {title ? <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 4px", fontWeight: 600 }}>{title}</h2> : null}
      {desc ? <p style={{ fontSize: ".82rem", color: "var(--text-p3)", margin: "0 0 14px" }}>{desc}</p> : null}
      {children}
    </section>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "warn"; children: ReactNode }) {
  const cls = kind === "ok" ? "notice notice-ok" : kind === "error" ? "notice notice-error" : "notice";
  return <div className={cls} style={kind === "warn" ? { borderColor: "var(--border)" } : undefined}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
