export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Eye, ListChecks, MousePointerClick, Newspaper } from "lucide-react";
import { auth } from "@/lib/auth";
import { getExternalPublicationRegistry } from "@/lib/external-publications";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, AnalyticsSection, MetricCard, MetricGrid, PeriodToolbar, formatNumber, formatPercent } from "../../admin-analytics-ui";
import { PublicationsManager } from "./publications-manager";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ExternalPublicationsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const registry = await getExternalPublicationRegistry(period);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-external-publications-page">
      <AdminHero
        eyebrow="контент и дистрибуция"
        title="Внешние публикации"
        actions={<PeriodToolbar basePath="/admin/marketing/publications" start={period.startInput} end={period.endInput} />}
      >
        Единый реестр материалов, опубликованных от имени ETerapy. Внешние просмотры вносятся срезами, а UTM-касания и конверсии считаются по первой стороне за выбранный период. <Link className="font-semibold text-blue-700 hover:underline" href="/admin/marketing">Вернуться к поисковой аналитике</Link>.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Всего материалов" value={formatNumber(registry.totals.all)} hint={`${formatNumber(registry.totals.published)} опубликовано`} icon={<Newspaper className="size-4" />} />
        <MetricCard label="В индексе" value={formatNumber(registry.totals.indexed)} hint="Проверено вручную или агентом" icon={<CheckCircle2 className="size-4" />} />
        <MetricCard label="Требуют действия" value={formatNumber(registry.totals.actionRequired)} hint="Индекс или контрольный срез" tone={registry.totals.actionRequired > 0 ? "warn" : "ok"} icon={<ListChecks className="size-4" />} />
        <MetricCard label="Внешние просмотры" value={formatNumber(registry.totals.views)} hint="Последний срез каждой публикации" icon={<Eye className="size-4" />} />
        <MetricCard label="UTM-касания" value={formatNumber(registry.totals.touches)} hint={`${formatNumber(registry.totals.conversions)} конверсий`} icon={<MousePointerClick className="size-4" />} />
        <MetricCard label="Конверсия" value={formatPercent(registry.totals.conversionRate)} hint="Конверсии / UTM-касания" icon={<BarChart3 className="size-4" />} />
      </MetricGrid>

      <div className="mt-6">
        <AnalyticsSection title="Реестр и контроль материалов">
          <PublicationsManager registry={registry} />
        </AnalyticsSection>
      </div>
    </main>
  );
}
