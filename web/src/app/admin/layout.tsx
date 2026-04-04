import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // @ts-expect-error custom
  if (!session || session.user?.role !== "ADMIN") redirect("/");
  return <AdminShell user={session.user}>{children}</AdminShell>;
}
