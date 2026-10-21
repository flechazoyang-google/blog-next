"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CommentActions({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: "approve" | "spam" | "delete") => {
    setBusy(true);
    await fetch(`/api/admin/comments/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    router.refresh();
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act("approve")}>通过</button>
      <button className="btn btn-sm" disabled={busy} onClick={() => act("spam")}>垃圾</button>
      <button className="btn btn-sm" disabled={busy} onClick={() => act("delete")}>删除</button>
    </div>
  );
}
