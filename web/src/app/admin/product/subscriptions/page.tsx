export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductCenterData, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, AnalyticsSection, HorizontalBars, PeriodToolbar, VerticalBarChart } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductSubscriptionsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const data = await getProductCenterData(period);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="продукт"
        title="Подписки, баллы и рефералы"
        actions={<PeriodToolbar basePath="/admin/product/subscriptions" start={period.startInput} end={period.endInput} />}
      >
        Реферальные регистрации и покупки подписки считаются ежедневно по выбранному календарному периоду.
      </AdminHero>
      <div className="grid gap-4">
        <AnalyticsSection title="Реферальные регистрации по дням">
          <VerticalBarChart data={data.charts.referralRegistrations} />
        </AnalyticsSection>
        <AnalyticsSection title="Покупки подписки пользователями, пришедшими по реферальной программе">
          <VerticalBarChart data={data.charts.referralSubscriptions} />
        </AnalyticsSection>
        <AnalyticsSection title="Топ-перформеры по приглашенным пользователям">
          <HorizontalBars data={data.charts.topReferrers} />
        </AnalyticsSection>
      </div>
    </main>
  );
}
