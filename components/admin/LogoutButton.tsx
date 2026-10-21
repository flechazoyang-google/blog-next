"use client";
import { useRouter } from "next/navigation";

export function LogoutButton({ username }: { username: string }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-sm"
      title={`退出 ${username}`}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/admin/login");
        router.refresh();
      }}
    >退出</button>
  );
}
