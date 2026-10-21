"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: number; type: string; title: string; status: string; dateLabel: string };

const TYPE_LABEL: Record<string, string> = { post: "文章", page: "页面", shuoshuo: "说说" };

export function PostList({ items, trash, stepUpRequired }: { items: Item[]; trash: boolean; stepUpRequired: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allOn = items.length > 0 && selected.length === items.length;

  const bulk = async (action: string) => {
    setMsg(""); setErr("");
    if (!selected.length) { setErr("请先选择"); return; }
    setBusy(true);
    const res = await fetch("/api/admin/posts/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, action, totp: code }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg("已完成，影响 " + d.affected + " 条");
      setSelected([]); setCode(""); setNeedCode(false);
      router.refresh();
    } else if (res.status === 428) {
      setNeedCode(true);
      setErr("该操作需要两步验证码");
    } else setErr(d.error || "操作失败");
  };

  const restore = async (id: number) => {
    setBusy(true); setErr(""); setMsg("");
    const res = await fetch("/api/admin/posts/" + id + "/restore", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg("已恢复"); router.refresh(); }
    else setErr(d.error || "恢复失败");
  };

  const purge = async (id: number) => {
    setBusy(true); setErr(""); setMsg("");
    const res = await fetch("/api/admin/posts/" + id + "/restore", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totp: code }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg("已彻底删除（连带评论 " + d.purgedComments + " 条）"); router.refresh(); }
    else if (res.status === 428) { setNeedCode(true); setErr("彻底删除需要两步验证码"); }
    else setErr(d.error || "删除失败");
  };

  if (items.length === 0) return <div className="empty">{trash ? "回收站是空的" : "还没有内容"}</div>;

  return (
    <>
      {msg ? <div className="notice notice-ok">{msg}</div> : null}
      {err ? <div className="notice notice-error">{err}</div> : null}

      {needCode || code ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: ".82rem", color: "var(--text-p3)" }}>两步验证码：</span>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)}
                 inputMode="numeric" maxLength={12} placeholder="6 位数字或恢复码"
                 style={{ maxWidth: 200, padding: "5px 10px" }} />
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: ".8rem", color: "var(--text-p3)" }}>
          <input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? [] : items.map((i) => i.id))} />
          全选（{selected.length}）
        </label>
        <span style={{ flex: 1 }} />
        {trash ? (
          <button className="btn btn-sm" disabled={busy || !selected.length} onClick={() => bulk("restore")}>批量恢复</button>
        ) : (
          <>
            <button className="btn btn-sm" disabled={busy || !selected.length} onClick={() => bulk("publish")}>发布</button>
            <button className="btn btn-sm" disabled={busy || !selected.length} onClick={() => bulk("unpublish")}>转草稿</button>
            <button className="btn btn-sm" disabled={busy || !selected.length}
                    style={{ borderColor: "#e5484d", color: "#e5484d" }} onClick={() => bulk("delete")}>
              移入回收站
            </button>
          </>
        )}
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--card-bg)" }}>
        {items.map((p) => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
            borderBottom: "1px solid var(--border)",
          }}>
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
            <span style={{
              fontSize: ".7rem", padding: "1px 7px", borderRadius: 999,
              border: "1px solid var(--border)", color: "var(--text-p3)", flexShrink: 0,
            }}>{TYPE_LABEL[p.type] ?? p.type}</span>

            {trash ? (
              <span style={{ flex: 1, fontSize: ".9rem", color: "var(--text-p0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.title || "(无标题)"}
              </span>
            ) : (
              <Link href={"/admin/edit/" + p.id} style={{
                flex: 1, fontSize: ".9rem", color: "var(--text-p0)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{p.title || "(无标题)"}</Link>
            )}

            <span style={{ fontSize: ".75rem", color: "var(--text-p4)", flexShrink: 0 }}>{p.dateLabel}</span>

            {trash ? (
              <span style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-sm" style={{ padding: "2px 8px", fontSize: ".72rem" }}
                        disabled={busy} onClick={() => restore(p.id)}>恢复</button>
                <button className="btn btn-sm" style={{ padding: "2px 8px", fontSize: ".72rem", color: "#e5484d", borderColor: "#e5484d" }}
                        disabled={busy} onClick={() => purge(p.id)}>彻底删除</button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
