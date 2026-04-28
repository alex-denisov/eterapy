import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminShell } from "./admin-shell";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { loginUrl, mainUrl } from "@/lib/subdomain";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  robots: noIndexRobots,
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session) redirect(loginUrl());
  if (!["ADMIN", "SUPERADMIN"].includes(role)) redirect(mainUrl("/"));

  const permissions = await getUserPermissions(session.user!.id!, role);

  return (
    <AdminShell user={session.user} role={role} permissions={permissions}>
      {children}
    </AdminShell>
  );
}
