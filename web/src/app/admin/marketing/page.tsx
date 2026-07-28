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
  formatNumber,
  formatPercent,
} from "../admin-analytics-ui";
import { SemanticCoreTable } from "./semantic-core-table";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatPosition(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function sourceTone(status: "ready" | "missing" | "error") {
  if (status === "ready") return "border-emerald-200 bg-emerald-50/70 text-emerald-800";
  if (status === "missing") return "border-amber-200 bg-amber-50/70 text-amber-800";
  return "border-red-200 bg-red-50/70 text-red-800";
}

function opportunityTone(value: string) {
  if (value === "Быстрый рост") return "bg-emerald-50 text-emerald-800";
  if (value === "Сниппет") return "bg-blue-50 text-blue-800";
  if (value === "Усилить страницу") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export default async function AdminMarketingPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const data = await getSearchMarketingData(period);
  const query = first(params.q)?.trim().toLocaleLowerCase("ru-RU") ?? "";
  const observedQueries = data.webmaster.queries
    .filter((item) => !query || item.query.toLocaleLowerCase("ru-RU").includes(query))
    .sort((a, b) => b.impressions - a.impressions);

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
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
          <form className="mb-4 flex max-w-xl gap-2" action="/admin/marketing" method="get">
            <input type="hidden" name="start" value={period.startInput} />
            <input type="hidden" name="end" value={period.endInput} />
            <label className="sr-only" htmlFor="marketing-query">Найти поисковый запрос</label>
            <input
              id="marketing-query"
              name="q"
              type="search"
              defaultValue={first(params.q)}
              placeholder="Например, ии психолог"
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-[#D6DEE9] bg-white px-3 text-sm outline-none focus:bg-slate-50"
            />
            <button className="soft-admin-action" type="submit">Найти</button>
          </form>
          {observedQueries.length === 0 ? (
            <EmptyState>{query ? "По этому фрагменту запросов пока нет" : "Вебмастер пока не вернул наблюдаемые запросы"}</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#D6DEE9]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-[0.68rem] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Запрос</th>
                    <th className="px-3 py-2.5 text-right">Показы</th>
                    <th className="px-3 py-2.5 text-right">Клики</th>
                    <th className="px-3 py-2.5 text-right">CTR</th>
                    <th className="px-3 py-2.5 text-right">Позиция</th>
                    <th className="px-3 py-2.5">Следующий ход</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {observedQueries.map((item) => (
                    <tr key={item.query} className="hover:bg-slate-50/70">
                      <td className="max-w-md px-3 py-2.5 font-medium text-slate-900">{item.query}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(item.impressions)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(item.clicks)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatPercent(item.ctr)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatPosition(item.averagePosition)}</td>
                      <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${opportunityTone(item.opportunity)}`}>{item.opportunity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              impressions: item.impressions,
              clicks: item.clicks,
            }))}
          />
          <p className="mt-2 text-xs text-slate-500">
            {formatNumber(data.keywordCore.length)} фраз по {new Set(data.keywordCore.map((item) => item.service)).size} услугам. Россия, broad match, порог 100 показов в месяц — фраза без замера в ядро не попадает. Живой Wordstat вызывается по одной головной фразе на услугу, остальное — сохранённый замер.
          </p>
        </AnalyticsSection>

        <div className="grid gap-4 xl:grid-cols-2">
          <AnalyticsSection title="Поисковые системы">
            <HorizontalBars data={data.metrika.searchEngines.map((item) => ({ label: item.label, value: item.visits }))} />
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
