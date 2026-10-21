import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { Editor } from "@/components/admin/Editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "写文章" };

export default async function NewPostPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  return (
    <AdminShell active="new" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 20px" }}>
        新建
      </h1>
      <Editor mode="new" />
    </AdminShell>
  );
}
