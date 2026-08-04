export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, FileCheck2, MousePointerClick, Search, TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import { getSearchMarketingData } from "@/lib/search-marketing-data";
import { resolveAdminPeriod } from "../admin-analytics-data";
import {
  AdminHero,
  AnalyticsSection,
  EmptyState,
  HorizontalBars,
  MetricCard,
  MetricGrid,
  PeriodToolbar,
  VerticalBarChart,
  formatNumber,
  formatPercent,
} from "../admin-analytics-ui";
import { listMarketingSnapshots } from "@/lib/marketing/daily-snapshot";
import { ObservedQueriesTable } from "./observed-queries-table";
import { MarketingSnapshotTable } from "./snapshot-table";
import { SemanticCoreTable } from "./semantic-core-table";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatPosition(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function sourceTone(status: "ready" | "missing" | "error") {
  if (status === "ready") return "border-emerald-200 bg-emerald-50/70 text-emerald-800";
  if (status === "missing") return "border-amber-200 bg-amber-50/70 text-amber-800";
  return "border-red-200 bg-red-50/70 text-red-800";
}

export default async function AdminMarketingPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const data = await getSearchMarketingData(period);
  // Фильтрация переехала в таблицу: она фильтрует на клиенте, без перезагрузки
  // страницы и без параметра `?q=` в адресе.
  const observedQueries = [...data.webmaster.queries].sort((a, b) => b.impressions - a.impressions);
  const snapshotRows = await listMarketingSnapshots(14);
  const snapshots = snapshotRows.map((row) => ({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
  }));
  // Таблица читается сверху вниз от свежего, график — слева направо по времени.
  const trend = [...snapshotRows].sort((left, right) => left.dayKey.localeCompare(right.dayKey));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-marketing-page">
      <AdminHero
        eyebrow="рост и обнаружение"
        title="Поиск и маркетинг"
        actions={<PeriodToolbar basePath="/admin/marketing" start={period.startInput} end={period.endInput} />}
      >
        Позиции считаются по запросам, по которым сайт уже показался в Яндексе. Wordstat показывает спрос рынка, а не позицию ETerapy. <Link className="font-semibold text-blue-700 hover:underline" href="/admin/marketing/publications">Открыть реестр внешних публикаций</Link> · <Link className="font-semibold text-blue-700 hover:underline" href="/admin/marketing/urls">Реестр URL и контроль ссылок</Link>.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Показы в поиске" value={formatNumber(data.totals.impressions)} hint="Наблюдаемые запросы Вебмастера" icon={<Search className="size-4" />} />
        <MetricCard label="Клики из поиска" value={formatNumber(data.totals.clicks)} hint={`CTR ${formatPercent(data.totals.ctr)}`} icon={<MousePointerClick className="size-4" />} />
        <MetricCard label="Средняя позиция" value={formatPosition(data.totals.averagePosition)} hint="Взвешена по показам" icon={<TrendingUp className="size-4" />} />
        <MetricCard label="Страниц в поиске" value={formatNumber(data.webmaster.summary.searchablePages)} hint={`${formatPercent(data.indexation.coverage)} от ${formatNumber(data.indexation.knownPublicPages)} известных URL`} tone={data.indexation.coverage < 80 ? "warn" : "ok"} icon={<FileCheck2 className="size-4" />} />
        <MetricCard label="Визиты из поисковиков" value={formatNumber(data.totals.organicVisits)} hint="Метрика за выбранный период" />
        <MetricCard label="Начато разборов" value={formatNumber(data.internal.dialogueStarts)} hint={`${formatPercent(data.internal.answerRate)} дошли до ответа`} icon={<Activity className="size-4" />} />
      </MetricGrid>

      <div className="mt-6 grid gap-4">
        <AnalyticsSection title="Состояние источников">
          {/* B650: источников стало пять — сетка на четыре колонки оставляла
              пятый висеть отдельной строкой. */}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {data.sources.map((source) => (
              <div key={source.key} className={`rounded-lg border px-3 py-3 ${sourceTone(source.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{source.label}</p>
                  <span className="text-[0.64rem] font-bold uppercase tracking-wide">
                    {source.status === "ready" ? "работает" : source.status === "missing" ? "не настроен" : "ошибка"}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-80">{source.note}</p>
              </div>
            ))}
          </div>
        </AnalyticsSection>

        <AnalyticsSection title="Запросы, по которым ETerapy уже показывается">
          {observedQueries.length === 0 ? (
            <EmptyState>Вебмастер пока не вернул наблюдаемые запросы</EmptyState>
          ) : (
            // B626: было — рукописная таблица без пагинации, сортировки и
            // фильтров, с отдельной формой поиска, перезагружавшей страницу.
            // Стало — та же компактная таблица, что в реестре пользователей.
            <ObservedQueriesTable
              rows={observedQueries.map((item) => ({
                query: item.query,
                impressions: item.impressions,
                clicks: item.clicks,
                ctrPercent: item.ctr,
                averagePosition: item.averagePosition,
                opportunity: item.opportunity,
              }))}
            />
          )}
        </AnalyticsSection>

        <AnalyticsSection title="Суточные срезы: что изменилось за день">
          <p className="mb-3 text-xs text-slate-600">
            Блоки выше собираются живым запросом при каждом открытии страницы.
            Отличить «источник пуст» от «мы перестали спрашивать» по пустой
            таблице невозможно, поэтому раз в московские сутки снимается срез с
            отметкой времени. Ноль с вчерашней датой — это ответ; пустая ячейка —
            нет. B657: прежняя подпись про единственную проиндексированную
            страницу снята — она устарела и вводила в заблуждение. Замер
            2026-08-04: в поиске Яндекса 213 страниц при нуле исключённых,
            индексация давно не узкое место.
            Низкие показы здесь — про спрос и позиции, а не про сбой
            интеграции; это открытая работа B470/B550.
          </p>
          {snapshots.length === 0 ? (
            <EmptyState>Первый суточный срез появится после ближайшего прохода воркера</EmptyState>
          ) : (
            <>
              {/*
                B649: срезы копились с B626, но выводились только таблицей —
                динамику по ним никто не рисовал. Средняя позиция сознательно
                НЕ на графике: у неё шкала перевёрнута (меньше = лучше), и на
                одной оси с показами она читалась бы ровно наоборот.
              */}
              <div className="mb-4 grid gap-4 xl:grid-cols-2">
                <VerticalBarChart
                  label="Показы, клики и визиты по дням"
                  data={trend.map((row) => ({
                    label: row.dayKey.slice(5),
                    value: row.impressions,
                    secondary: row.clicks,
                    tertiary: row.organicVisits,
                  }))}
                  seriesLabels={["показы", "клики", "визиты из поиска"]}
                  integerTicks
                />
                <VerticalBarChart
                  label="Страниц в индексе и наблюдаемых запросов"
                  data={trend.map((row) => ({
                    label: row.dayKey.slice(5),
                    value: row.searchablePages,
                    secondary: row.observedQueries,
                  }))}
                  seriesLabels={["страниц в поиске", "запросов"]}
                  integerTicks
                />
              </div>
              <MarketingSnapshotTable rows={snapshots} />
            </>
          )}
        </AnalyticsSection>

        <AnalyticsSection title="Очередь SEO-действий">
          {data.actions.length === 0 ? (
            <EmptyState>Критичных действий по текущим данным нет</EmptyState>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {data.actions.map((action) => (
                <div key={`${action.title}-${action.note}`} className={`rounded-lg border p-3 ${action.tone === "warn" ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50/70"}`}>
                  <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{action.note}</p>
                </div>
              ))}
            </div>
          )}
        </AnalyticsSection>

        <AnalyticsSection title="Семантическое ядро по услугам">
          <SemanticCoreTable
            rows={data.keywordCore.map((item) => ({
              phrase: item.phrase,
              serviceName: item.serviceName,
              cluster: item.cluster,
              landing: item.landing,
              priority: item.priority,
              intent: item.intent,
              monthlyDemand: item.monthlyDemand,
              demandSource: item.demandSource,
              position: item.position,
              exactPosition: item.exactPosition,
              impressions: item.impressions,
              clicks: item.clicks,
              matchedQueries: item.matchedQueries,
            }))}
          />
          <p className="mt-2 text-xs text-slate-500">
            {formatNumber(data.keywordCore.length)} фраз по {new Set(data.keywordCore.map((item) => item.service)).size} услугам. Россия, broad match, порог 100 показов в месяц — фраза без замера в ядро не попадает. Живой Wordstat вызывается по одной головной фразе на услугу, остальное — сохранённый замер.
          </p>
        </AnalyticsSection>

        <div className="grid gap-4 xl:grid-cols-2">
          <AnalyticsSection title="Поисковые системы">
            {/*
              B650: пустой график читался как поломка интеграции. Метрика за
              период честно отвечает «переходов из поиска не было» — и это
              разные вещи, которые обязаны выглядеть по-разному.
            */}
            {data.metrika.searchEngines.length === 0 ? (
              <EmptyState>
                Метрика за выбранный период не увидела ни одного перехода из поиска. Это ответ источника, а не сбой: за неделю Вебмастер насчитал {formatNumber(data.totals.impressions)} показов и {formatNumber(data.totals.clicks)} кликов, а счётчик срабатывает только после согласия на cookies.
              </EmptyState>
            ) : (
              <HorizontalBars data={data.metrika.searchEngines.map((item) => ({ label: item.label, value: item.visits }))} />
            )}
          </AnalyticsSection>
          {/*
            B650 — Google отдельным блоком, а не строкой в яндексовых итогах.
            Смешивать их в одну цифру нельзя: у Вебмастера и Search Console
            разные окна выгрузки, разные правила округления и разное определение
            показа. Сложенная сумма выглядела бы точнее, чем она есть.
          */}
          <AnalyticsSection title="Google Search Console">
            {data.sources.find((item) => item.key === "searchConsole")?.status !== "ready" ? (
              <EmptyState>
                Источник не подключён. Панель не показывает по Google ноль — она показывает, что не спрашивала: нужны `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` и `GOOGLE_OAUTH_REFRESH_TOKEN` в секретах выкатки.
              </EmptyState>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label="Показы в Google" value={formatNumber(data.searchConsole.totals.impressions)} />
                  <MetricCard label="Клики из Google" value={formatNumber(data.searchConsole.totals.clicks)} hint={`CTR ${formatPercent(data.searchConsole.totals.ctr)}`} />
                  <MetricCard label="Средняя позиция" value={formatPosition(data.searchConsole.totals.averagePosition)} />
                  <MetricCard label="Запросов в отчёте" value={formatNumber(data.searchConsole.queries.length)} />
                </div>
                {data.searchConsole.emptyReason ? (
                  <p className="mt-3 text-xs text-slate-600">{data.searchConsole.emptyReason}</p>
                ) : (
                  <div className="mt-4">
                    <HorizontalBars
                      data={data.searchConsole.queries
                        .slice(0, 10)
                        .map((item) => ({ label: item.query, value: item.impressions }))}
                    />
                  </div>
                )}
              </>
            )}
          </AnalyticsSection>
          <AnalyticsSection title="Внутренняя маркетинговая воронка">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Создано диалогов" value={formatNumber(data.internal.dialogueStarts)} />
              <MetricCard label="Первичных ответов" value={formatNumber(data.internal.primaryAnswers)} />
              <MetricCard label="Конверсия в ответ" value={formatPercent(data.internal.answerRate)} />
              <MetricCard label="Органические конверсии" value={formatNumber(data.internal.organicConversions)} hint={`${formatNumber(data.internal.conversions)} всего`} />
            </div>
            <div className="mt-4"><HorizontalBars data={data.internal.channels} /></div>
          </AnalyticsSection>
        </div>
      </div>
    </main>
  );
}
