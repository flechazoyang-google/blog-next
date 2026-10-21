import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { TotpSetup } from "@/components/admin/TotpSetup";

export const dynamic = "force-dynamic";
export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  return (
    <AdminShell active="settings" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 20px" }}>
        设置
      </h1>

      <section style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-bg)", padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: ".95rem", color: "var(--text-p0)", margin: "0 0 6px", fontWeight: 600 }}>账号</h2>
        <p style={{ fontSize: ".85rem", color: "var(--text-p3)", margin: "0 0 12px" }}>当前账号：{user.username}</p>
      </section>

      <TotpSetup enabled={!!user.totp_enabled} />
    </AdminShell>
  );
}
