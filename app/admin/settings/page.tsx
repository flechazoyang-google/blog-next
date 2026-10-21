import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSettings } from "@/lib/settings";
import { remainingRecoveryCodes } from "@/lib/auth";
import { listSessions } from "@/lib/session";
import { readToken } from "@/lib/guards";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { SecurityPanel } from "@/components/admin/SecurityPanel";
import { formatIn } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const settings = getSettings();
  const token = (await readToken()) ?? "";
  const sessions = listSessions(user.id, token).map((s) => ({
    ...s,
    createdAtLabel: formatIn(s.createdAt, "datetime"),
    lastSeenLabel: s.lastSeenAt ? formatIn(s.lastSeenAt, "datetime") : "-",
  }));

  return (
    <AdminShell active="settings" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 20px" }}>
        设置
      </h1>

      <SettingsForm initial={settings} />

      <SecurityPanel
        username={user.username}
        totpEnabled={!!user.totp_enabled}
        recoveryRemaining={remainingRecoveryCodes(user.id)}
        sessions={sessions}
      />
    </AdminShell>
  );
}
