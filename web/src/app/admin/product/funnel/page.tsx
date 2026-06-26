export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductCenterData, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, AnalyticsSection, FunnelChart, MetricCard, MetricGrid, PeriodToolbar, VerticalBarChart, formatNumber } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductFunnelPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const data = await getProductCenterData(period);
  const firstStage = data.funnel[0]?.value ?? 0;
  const paidIntent = data.funnel.slice(2).reduce((sum, item) => sum + item.value, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-product-funnel">
      <AdminHero
        eyebrow="продукт и клиенты"
        title="Воронка и конверсии"
        actions={<PeriodToolbar basePath="/admin/product/funnel" start={period.startInput} end={period.endInput} />}
      >
        Последовательный путь вопрос → бесплатный ответ → CTA углубления → подписка или покупка баллов. Каждый следующий этап считается как подмножество предыдущего.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Стартов воронки" value={formatNumber(firstStage)} />
        <MetricCard label="Платный интент" value={formatNumber(paidIntent)} />
        <MetricCard label="Результаты продуктов" value={formatNumber(data.results.length)} href="/admin/product/results" />
        <MetricCard label="Новые пользователи" value={formatNumber(data.users.length)} href="/admin/product/users" />
      </MetricGrid>

      <div className="mt-6 grid gap-4">
        <AnalyticsSection title="Основная продуктовая воронка">
          <FunnelChart data={data.funnel} />
        </AnalyticsSection>
        <AnalyticsSection title="CTA и продуктовые действия по дням" actionHref="/admin/product/results" actionLabel="Результаты">
          <VerticalBarChart label="Самые активные продукты" data={data.charts.productByDay} seriesLabels={data.charts.productByDayLabels} />
        </AnalyticsSection>
        <AnalyticsSection title="Реферальная конверсия" actionHref="/admin/product/subscriptions" actionLabel="Рефералы">
          <div className="grid gap-4 xl:grid-cols-2">
            <VerticalBarChart label="Регистрации по реферальной ссылке" data={data.charts.referralRegistrations} />
            <VerticalBarChart label="Покупки подписки рефералами" data={data.charts.referralSubscriptions} />
          </div>
        </AnalyticsSection>
      </div>
    </main>
  );
}
