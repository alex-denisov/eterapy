export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getAllSettings } from "@/lib/platform-settings";
import { PricingEditor } from "./pricing-editor";
import { PageContainer } from "@/components/ui/page-container";

export default async function AdminPricingPage() {
  const session = await auth();
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");

  const [settings, practitioners] = await Promise.all([
    getAllSettings(),
    db.practitioner.findMany({
      include: {
        user: { select: { name: true, email: true } },
        priceRates: { orderBy: { durationMin: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6">
        <p className="premium-eyebrow">монетизация</p>
        <h1 className="premium-title mt-2 text-3xl md:text-4xl">Цены и тарифы</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Управление тарифными планами, комиссией и ценами практиков. Изменения применяются немедленно.
        </p>
      </div>
      <PricingEditor initialSettings={settings} practitioners={practitioners} />
    </PageContainer>
  );
}
