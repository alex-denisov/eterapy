export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getAllSettings } from "@/lib/platform-settings";
import { PageContainer } from "@/components/ui/page-container";
import { AdminCurrencySelector } from "../../admin-currency-selector";
import { formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../../admin-currency";
import { AdminHero } from "../../admin-analytics-ui";
import { PricingEditor } from "../../pricing/pricing-editor";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FinancePricingPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const currency = resolveAdminCurrency(params);

  const [settings, practitioners, currencyRates] = await Promise.all([
    getAllSettings(),
    db.practitioner.findMany({
      include: {
        user: { select: { name: true, email: true } },
        priceRates: { orderBy: { durationMin: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    getAdminCurrencyRates(),
  ]);

  return (
    <PageContainer maxWidth="full" className="py-8">
      <AdminHero
        eyebrow="финансы · монетизация"
        title="Цены и тарифы"
        actions={
          <AdminCurrencySelector basePath="/admin/finance/pricing" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} />
        }
      >
        Управление тарифными планами, комиссией и ценами практиков. Изменения применяются немедленно.
      </AdminHero>
      <PricingEditor initialSettings={settings} practitioners={practitioners} />
    </PageContainer>
  );
}
