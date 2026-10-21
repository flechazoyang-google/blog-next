import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { getDb, type MediaRow } from "@/lib/db";
import { MediaGrid } from "@/components/admin/MediaGrid";

export const dynamic = "force-dynamic";
export const metadata = { title: "图片" };

export default async function MediaPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const db = getDb();
  const rows = db.prepare("SELECT * FROM media ORDER BY created_at DESC LIMIT 120").all() as MediaRow[];
  const total = (db.prepare("SELECT COUNT(*) c FROM media").get() as { c: number }).c;
  const refStmt = db.prepare("SELECT COUNT(*) c FROM posts WHERE deleted_at IS NULL AND content LIKE ?");
  const items = rows.map((m) => ({
    ...m,
    refs: (refStmt.get("%" + m.path + "%") as { c: number }).c,
  }));
  const totalBytes = (db.prepare("SELECT COALESCE(SUM(size),0) s FROM media").get() as { s: number }).s;

  return (
    <AdminShell active="media" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 6px" }}>
        图片
      </h1>
      <p style={{ fontSize: ".82rem", color: "var(--text-p4)", margin: "0 0 20px" }}>
        共 {total} 张，占用 {(totalBytes / 1024 / 1024).toFixed(1)} MB。删除前会检查是否仍被文章引用。
      </p>
      <MediaGrid items={items} />
    </AdminShell>
  );
}
