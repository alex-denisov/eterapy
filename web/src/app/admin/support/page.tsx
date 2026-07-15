import { redirect } from "next/navigation";
import { adminUrl } from "@/lib/subdomain";
import { getSupportOperatorAccess } from "@/lib/admin-support-access";
import { SupportConsole } from "./support-console";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const access = await getSupportOperatorAccess();
  if (!access) redirect(adminUrl("/admin"));

  return (
    <main className="mx-auto max-w-[1500px] px-3 py-5 sm:px-5 sm:py-7" data-testid="admin-support-page">
      <SupportConsole />
    </main>
  );
}
