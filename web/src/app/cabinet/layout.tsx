import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CabinetShell } from "@/components/cabinet/cabinet-shell";

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  // @ts-expect-error custom field
  const role = session.user?.role ?? "CLIENT";

  return <CabinetShell role={role} user={session.user}>{children}</CabinetShell>;
}
