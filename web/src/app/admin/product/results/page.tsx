export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/subdomain";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { getProductCenterData, productLabel, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, AnalyticsSection, PeriodToolbar, StackedBarChart, VerticalBarChart, formatDateTime, formatNumber, statusLabel } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const resultColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Дата и время", sortable: true, filterKind: "date" },
  { key: "client", label: "Клиент", sortable: true },
  { key: "product", label: "Продукт", sortable: true },
  { key: "title", label: "Название", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "READY", label: "Готово" },
      { value: "CREATED", label: "Создано" },
      { value: "FAILED", label: "Ошибка" },
    ],
  },
  { key: "open", label: "Открыть", filterKind: "none", align: "center" },
];

export default async function ProductResultsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const data = await getProductCenterData(period);

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
        <AdminCompactDataTable
          columns={resultColumns}
          rows={data.results.map((result) => {
            const resultStatus = String(result.status);
            return {
              id: result.id,
              cells: {
                createdAt: { value: formatDateTime(result.createdAt), sortValue: new Date(result.createdAt).getTime(), filterValue: formatDateTime(result.createdAt) },
                client: { value: result.user.name ?? "—", subvalue: result.user.email, filterValue: `${result.user.name ?? ""} ${result.user.email ?? ""}` },
                product: { value: productLabel(result.productKey), filterValue: `${productLabel(result.productKey)} ${result.productKey}` },
                title: result.title,
                status: { kind: "status", label: statusLabel(result.status), tone: resultStatus === "FAILED" ? "danger" : resultStatus === "READY" ? "ok" : "warn", filterValue: `${result.status} ${statusLabel(result.status)}` },
                open: { kind: "link", href: appUrl(`/cabinet/results/${result.id}`), icon: "open", external: true, title: `Открыть результат ${result.title}` },
              },
            };
          })}
          empty="Результатов за выбранный период нет"
          minWidth="1120px"
        />
      </div>
    </main>
  );
}
