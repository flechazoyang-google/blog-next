"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CommentActions({ id, currentStatus }: { id: number; currentStatus?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const act = async (action: "approve" | "spam" | "delete") => {
    setBusy(true); setErr("");
    const res = await fetch("/api/admin/comments/" + id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "操作失败");
    }
    setBusy(false);
    router.refresh();
  };

  const btn = (label: string, action: "approve" | "spam" | "delete", primary?: boolean, danger?: boolean) => (
    <button
      className={"btn btn-sm" + (primary ? " btn-primary" : "")}
      disabled={busy}
      onClick={() => act(action)}
      style={danger ? { borderColor: "#e5484d", color: "#e5484d" } : undefined}
    >{label}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        {currentStatus !== "approved" ? btn("通过", "approve", true) : null}
        {currentStatus !== "spam" ? btn("垃圾", "spam") : null}
        {btn("删除", "delete", false, true)}
      </div>
      {err ? <div style={{ fontSize: ".76rem", color: "#e5484d", marginTop: 6 }}>{err}</div> : null}
    </div>
  );
}
