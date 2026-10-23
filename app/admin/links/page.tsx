import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { listFriendLinks } from "@/lib/friend-links";
import { LinksManager } from "@/components/admin/LinksManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "外链" };

export default async function LinksPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");

  const links = listFriendLinks();

  return (
    <AdminShell active="links" username={user.username}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", color: "var(--text-p0)", margin: "0 0 6px" }}>
        外链
      </h1>
      <p style={{ fontSize: ".82rem", color: "var(--text-p4)", margin: "0 0 20px" }}>
        这里新增的条目会同时出现在桌面端右侧栏和手机端抽屉中，无需改代码或重新部署。
        「聚合」类渲染为卡片（适合开往这类友链接力站），「友链」类渲染为紧凑列表。排序值小的靠前。
      </p>
      <LinksManager initial={links} />
    </AdminShell>
  );
}
