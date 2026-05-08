export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function PractitionerServicesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="soft-h1 mb-6">Услуги и цены</h1>
      <div className="soft-card p-6">
        <p className="text-[var(--soft-ink-soft)]">
          Управление услугами и ценами будет доступно в следующем обновлении.
          Для изменения цен обратитесь в поддержку.
        </p>
      </div>
    </div>
  );
}
