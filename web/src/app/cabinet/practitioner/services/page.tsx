export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function PractitionerServicesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  return (
    <div className="max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="premium-title text-3xl md:text-5xl mb-6">Услуги и цены</h1>
      <div className="soft-card p-6">
        <p className="text-[var(--soft-ink-soft)]">
          Управление услугами и ценами будет доступно в следующем обновлении.
          Для изменения цен обратитесь в поддержку.
        </p>
      </div>
    </div>
  );
}
