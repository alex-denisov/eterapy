export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Eye, ListChecks, MousePointerClick, Newspaper } from "lucide-react";
import { auth } from "@/lib/auth";
import { getExternalPublicationRegistry } from "@/lib/external-publications";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, AnalyticsSection, MetricCard, MetricGrid, PeriodToolbar, formatNumber, formatPercent } from "../../admin-analytics-ui";
import db from "@/lib/db";
import { CONTENT_PLAN } from "@/lib/marketing/content-plan";
import { PublicationsManager } from "./publications-manager";
import { DraftQueue, type DraftRow } from "./draft-queue";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ExternalPublicationsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const registry = await getExternalPublicationRegistry(period);

  // B589 фаза 1: очередь черновиков. Отдельный запрос, а не часть реестра за
  // период: черновик ещё не опубликован, и датой публикации его не отфильтровать.
  const drafts = await db.externalPublication.findMany({
    // B654: `MANUAL` — материал, который ждёт человека. Он обязан быть виден
    // здесь: очередь ручных публикаций и есть его единственная дорога наружу.
    where: { status: { in: ["DRAFT", "REVIEW", "SCHEDULED", "MANUAL", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const draftRows: DraftRow[] = drafts.map((draft) => ({
    id: draft.id,
    status: draft.status,
    platform: draft.platform,
    cluster: draft.cluster,
    targetQuery: draft.targetQuery,
    title: draft.title,
    body: draft.body ?? "",
    destinationUrl: draft.destinationUrl,
    scheduledFor: draft.scheduledFor?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-external-publications-page">
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
          <h2 className="mb-1 text-base font-semibold text-[var(--soft-ink-strong)]">
            Запланированные публикации — {draftRows.length} из {CONTENT_PLAN.length} слотов плана
          </h2>
          <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
            Черновики собирает ночной джоб <code>cron.marketing-generate</code> по
            контент-плану: каждый пост ведёт на уже существующую статью
            библиотеки. Публикуется только утверждённый материал, когда для
            площадки настроен официальный API и включён общий флаг выпуска.
            Рекламные комментарии всегда проходят отдельную премодерацию в
            служебном Telegram-канале.
          </p>
          <DraftQueue rows={draftRows} />
          <h2 className="mb-3 mt-8 text-base font-semibold text-[var(--soft-ink-strong)]">
            Опубликованные материалы и контрольные срезы
          </h2>
          <PublicationsManager registry={registry} />
        </AnalyticsSection>
      </div>
    </main>
  );
}
