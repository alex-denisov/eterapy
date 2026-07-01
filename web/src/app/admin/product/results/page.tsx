export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/subdomain";
import { getProductCenterData, productLabel, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, AnalyticsSection, DataTable, LinkPagination, PeriodToolbar, StackedBarChart, StatusBadge, VerticalBarChart, formatDateTime, formatNumber } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductResultsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const q = (first(params.q) ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(first(params.page)) || 1);
  const data = await getProductCenterData(period);
  const filtered = data.results.filter((result) => {
    if (!q) return true;
    return [
      result.title,
      result.status,
      productLabel(result.productKey),
      result.user.name,
      result.user.email,
    ].some((value) => value?.toLowerCase().includes(q));
  });
  const take = 20;
  const rows = filtered.slice((page - 1) * take, page * take);
  const paginationHref = (nextPage: number) => `/admin/product/results?start=${period.startInput}&end=${period.endInput}&q=${encodeURIComponent(q)}&page=${nextPage}`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="продукт"
        title="Продукты и результаты"
        actions={<PeriodToolbar basePath="/admin/product/results" start={period.startInput} end={period.endInput} />}
      >
        Для каждого цифрового продукта показывается дневное потребление, ниже — полный реестр заказанных результатов.
      </AdminHero>
      <div className="grid gap-4">
        <AnalyticsSection title="Все продукты по дням">
          <StackedBarChart
            label="Все заказанные продукты по календарным дням"
            data={data.charts.productByDayStacked}
            integerTicks
          />
        </AnalyticsSection>
        {data.charts.productUsageByProduct.length === 0 ? (
          <AnalyticsSection title="Использование продуктов">Нет результатов за выбранный период.</AnalyticsSection>
        ) : data.charts.productUsageByProduct.map((item) => (
          <AnalyticsSection key={item.productKey} title={`${item.label} · ${formatNumber(item.total)}`}>
            <VerticalBarChart
              label="Заказы по календарным дням в разрезе тарифа клиента"
              data={item.chart}
              seriesLabels={["Free / без подписки", "Plus", "Premium"]}
              integerTicks
            />
          </AnalyticsSection>
        ))}
      </div>
      <div className="mt-6">
        <form className="mb-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="start" value={period.startInput} />
          <input type="hidden" name="end" value={period.endInput} />
          <input name="q" defaultValue={q} placeholder="Поиск по клиенту, email, продукту, статусу" className="min-w-72 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-3 py-2 text-sm" />
          <button className="soft-admin-action" type="submit">Найти</button>
        </form>
        <DataTable
          columns={["Timestamp", "Клиент", "Продукт", "Название", "Статус", "Открыть"]}
          rows={rows.map((result) => [
            formatDateTime(result.createdAt),
            <span key="user">{result.user.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{result.user.email}</span></span>,
            productLabel(result.productKey),
            result.title,
            <StatusBadge key="status" status={result.status} />,
            <a key="open" className="soft-admin-icon-button" href={appUrl(`/cabinet/results/${result.id}`)} target="_blank" rel="noreferrer" title="Открыть результат" aria-label={`Открыть результат ${result.title}`}>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>,
          ])}
        />
        <LinkPagination page={page} pageSize={take} total={filtered.length} hrefForPage={paginationHref} />
      </div>
    </main>
  );
}
