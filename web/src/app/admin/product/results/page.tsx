export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductCenterData, productLabel, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, DataTable, PeriodToolbar, VerticalBarChart, formatDateTime } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductResultsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
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
      <VerticalBarChart label="Компактная дневная гистограмма: Free / Plus / Premium продуктовые действия" data={data.charts.productByDay} />
      <div className="mt-6">
        <DataTable
          columns={["Timestamp", "Клиент", "Продукт", "Название", "Статус", "Открыть"]}
          rows={data.results.slice(0, 20).map((result) => [
            formatDateTime(result.createdAt),
            <span key="user">{result.user.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{result.user.email}</span></span>,
            productLabel(result.productKey),
            result.title,
            result.status,
            <a key="open" className="soft-admin-action" href={`/api/admin/product-results/${result.id}`} target="_blank">Открыть</a>,
          ])}
        />
      </div>
    </main>
  );
}
