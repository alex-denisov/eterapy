import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // @ts-expect-error custom
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/");
  return <AdminShell user={session.user} role={role}>{children}</AdminShell>;
}
