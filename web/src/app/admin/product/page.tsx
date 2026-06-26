export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductCenterData, resolveAdminPeriod } from "../admin-analytics-data";
import { AdminHero, AnalyticsSection, FunnelChart, MetricCard, MetricGrid, PeriodToolbar, VerticalBarChart, formatNumber } from "../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductCenterPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const data = await getProductCenterData(period);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-product-center">
      <AdminHero
        eyebrow="продукт и клиенты"
        title="Клиентский путь и продукты"
        actions={<PeriodToolbar basePath="/admin/product" start={period.startInput} end={period.endInput} />}
      >
        Управление клиентским путем: заявки, бронирования, сессии, результаты, отзывы, жалобы, антифрод, библиотека вопросов и реферальные механики.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Новые пользователи" value={formatNumber(data.users.length)} href="/admin/product/users" />
        <MetricCard label="Результаты продуктов" value={formatNumber(data.results.length)} href="/admin/product/results" />
        <MetricCard label="Сессии с транскриптами" value={formatNumber(data.sessions.length)} href="/admin/product/sessions" />
        <MetricCard label="Очередь контроля" value={formatNumber(data.operations.complaints + data.operations.applications + data.operations.reviews)} href="/admin/product/quality" />
      </MetricGrid>

      <div className="mt-6 grid gap-4">
        <AnalyticsSection title="Воронка продукта" actionHref="/admin/product/funnel" actionLabel="Воронка и конверсии">
          <FunnelChart data={data.funnel} />
        </AnalyticsSection>
        <AnalyticsSection title="Использование продуктов по дням" actionHref="/admin/product/results" actionLabel="Продукты и результаты">
          <VerticalBarChart label="Группированные столбцы по самым активным продуктам" data={data.charts.productByDay} seriesLabels={data.charts.productByDayLabels} />
        </AnalyticsSection>
        <AnalyticsSection title="Подписки, баллы и рефералы" actionHref="/admin/product/subscriptions" actionLabel="Открыть">
          <div className="grid gap-4 xl:grid-cols-2">
            <VerticalBarChart label="Покупки подписок по дням" data={data.charts.subscriptionPurchases} seriesLabels={["Пробный / без подписки", "Плюс", "Премиум"]} />
            <VerticalBarChart label="Баллы на балансе по дням" data={data.charts.creditsBalanceByDay} />
            <VerticalBarChart label="Регистрации по реферальным ссылкам по дням" data={data.charts.referralRegistrations} />
            <VerticalBarChart label="Покупка подписки рефералами по дням" data={data.charts.referralSubscriptions} />
          </div>
        </AnalyticsSection>
      </div>
    </main>
  );
}
