export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BrainCircuit, Clock3, CircleDollarSign, Gauge, Hash } from "lucide-react";
import { auth } from "@/lib/auth";
import { getAIControlCenterData } from "@/lib/ai-gateway/admin-config";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { formatAdminAiCostRub, formatCbrRateLabel, getAdminCurrencyRates } from "../../admin-currency";
import { PeriodToolbar, StatusBadge } from "../../admin-analytics-ui";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminOpsMetric, AdminOpsSection, formatDateTime, formatNumber, formatPercent } from "../ops-ui";

type SearchParams = Record<string, string | string[] | undefined>;

function featureTitle(feature: string) {
  const known: Record<string, string> = {
    "dialogue": "Диалоги",
    "deep-report": "Глубокий разбор",
    "reframe": "Переосмысление",
    "symbolic": "Символические продукты",
    "chat-analysis": "Разбор переписки",
    "compatibility": "Совместимость",
    "synastry": "Синастрия",
    "human-design": "Human Design",
    "surname-story": "История фамилии",
  };
  const key = Object.keys(known).find((item) => feature.includes(item));
  return key ? known[key] : feature;
}

function statusTone(value: number) {
  if (value >= 10) return "danger" as const;
  if (value > 0) return "warn" as const;
  return "ok" as const;
}

export default async function AdminOpsAICostPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("ai.configure")) redirect("/admin");

  const period = resolveAdminPeriod(params);
  const [data, currencyRates] = await Promise.all([
    getAIControlCenterData(period.endInput, { includeSecrets: role === "SUPERADMIN" }),
    getAdminCurrencyRates(period.end),
  ]);
  const totals = data.usageDetails.reduce(
    (acc, row) => {
      acc.requests += row.requestCount;
      acc.attempts += row.attemptCount;
      acc.success += row.successCount;
      acc.tokens += row.totalTokens;
      acc.prompt += row.promptTokens;
      acc.completion += row.completionTokens;
      acc.cost += row.costMicros;
      if (row.avgLatencyMs) acc.latencySum += row.avgLatencyMs * row.requestCount;
      return acc;
    },
    { requests: 0, attempts: 0, success: 0, tokens: 0, prompt: 0, completion: 0, cost: 0, latencySum: 0 },
  );
  const errors = Math.max(totals.attempts - totals.success, 0);
  const errorRate = totals.attempts > 0 ? (errors / totals.attempts) * 100 : 0;
  const avgLatency = totals.requests > 0 ? Math.round(totals.latencySum / totals.requests) : 0;

  const byFeatureMap = data.usageDetails.reduce((map, row) => {
    const current = map.get(row.feature) ?? { feature: row.feature, requests: 0, tokens: 0, cost: 0, errors: 0 };
    current.requests += row.requestCount;
    current.tokens += row.totalTokens;
    current.cost += row.costMicros;
    current.errors += Math.max(row.attemptCount - row.successCount, 0);
    map.set(row.feature, current);
    return map;
  }, new Map<string, { feature: string; requests: number; tokens: number; cost: number; errors: number }>());
  const byFeature = Array.from(byFeatureMap.values()).sort((a, b) => b.cost - a.cost);

  const byProviderMap = data.usageDetails.reduce((map, row) => {
    const current = map.get(row.provider) ?? { provider: row.provider, requests: 0, tokens: 0, cost: 0, errors: 0 };
    current.requests += row.requestCount;
    current.tokens += row.totalTokens;
    current.cost += row.costMicros;
    current.errors += Math.max(row.attemptCount - row.successCount, 0);
    map.set(row.provider, current);
    return map;
  }, new Map<string, { provider: string; requests: number; tokens: number; cost: number; errors: number }>());
  const byProvider = Array.from(byProviderMap.values()).sort((a, b) => b.cost - a.cost);

  const maxFeatureCost = Math.max(...byFeature.map((row) => row.cost), 1);
  const maxProviderCost = Math.max(...byProvider.map((row) => row.cost), 1);
  const recentInteractions = data.interactions.slice(0, 12);

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">расход AI · {period.startInput} — {period.endInput}</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">AI-затраты и токены</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Контроль фактических токенов, рублевых затрат, ошибок, времени ответа и распределения расходов по продуктам, провайдерам и моделям.
          </p>
        </div>
        <PeriodToolbar basePath="/admin/ops/ai-cost" start={period.startInput} end={period.endInput} />
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <AdminOpsMetric icon={CircleDollarSign} label="Расход" value={formatAdminAiCostRub(totals.cost, currencyRates)} hint={`Факт по стоимости моделей AI-центра · ${formatCbrRateLabel(currencyRates)}`} tone={totals.cost > 0 ? "neutral" : "ok"} />
        <AdminOpsMetric icon={Hash} label="Токены" value={formatNumber(totals.tokens)} hint={`${formatNumber(totals.prompt)} входящих, ${formatNumber(totals.completion)} исходящих`} />
        <AdminOpsMetric icon={BrainCircuit} label="Запросы" value={formatNumber(totals.requests)} hint={`${formatNumber(totals.attempts)} попыток маршрутизации`} />
        <AdminOpsMetric icon={AlertTriangle} label="Ошибки" value={formatPercent(errorRate)} hint={`${formatNumber(errors)} неуспешных попыток`} tone={statusTone(errorRate)} />
        <AdminOpsMetric icon={Clock3} label="Время ответа" value={`${formatNumber(avgLatency)} ms`} hint="Среднее, взвешенное по числу запросов" tone={avgLatency > 10_000 ? "warn" : "ok"} />
        <AdminOpsMetric icon={Gauge} label="Модели" value={formatNumber(Object.values(data.models).flat().length)} hint={`${formatNumber(data.providers.filter((row) => row.enabled).length)} провайдеров включено`} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminOpsSection title="Расход по продуктам" actionHref="/admin/ai" actionLabel="Настроить маршруты">
          <div className="space-y-3">
            {byFeature.length === 0 && <p className="text-sm text-[var(--soft-ink-soft)]">За выбранный день расход не найден.</p>}
            {byFeature.map((row) => (
              <div key={row.feature}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{featureTitle(row.feature)}</span>
                  <span className="tabular-nums text-[var(--soft-bordeaux)]">{formatAdminAiCostRub(row.cost, currencyRates)}</span>
                </div>
                <div className="h-8 overflow-hidden rounded-md border border-[var(--soft-paper-edge)] bg-white">
                  <div
                    className="flex h-full items-center justify-end bg-[var(--soft-bordeaux)] px-2 text-xs font-semibold text-white"
                    style={{ width: `${Math.max(5, Math.round((row.cost / maxFeatureCost) * 100))}%` }}
                  >
                    {formatNumber(row.tokens)}
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{formatNumber(row.requests)} запросов · {formatNumber(row.errors)} ошибок</p>
              </div>
            ))}
          </div>
        </AdminOpsSection>

        <AdminOpsSection title="Расход по провайдерам" actionHref="/admin/ai" actionLabel="Открыть AI-центр">
          <div className="space-y-3">
            {byProvider.length === 0 && <p className="text-sm text-[var(--soft-ink-soft)]">За выбранный день провайдеры не списывали токены.</p>}
            {byProvider.map((row) => (
              <div key={row.provider}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{row.provider}</span>
                  <span className="tabular-nums text-[var(--soft-bordeaux)]">{formatAdminAiCostRub(row.cost, currencyRates)}</span>
                </div>
                <div className="grid h-8 grid-cols-[1fr_auto] overflow-hidden rounded-md border border-[var(--soft-paper-edge)] bg-white">
                  <div
                    className="bg-[var(--soft-apricot)]"
                    style={{ width: `${Math.max(5, Math.round((row.cost / maxProviderCost) * 100))}%` }}
                  />
                  <span className="flex items-center px-2 text-xs text-[var(--soft-ink-soft)]">{formatNumber(row.tokens)} токенов</span>
                </div>
                <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{formatNumber(row.requests)} запросов · {formatNumber(row.errors)} ошибок</p>
              </div>
            ))}
          </div>
        </AdminOpsSection>
      </div>

      <AdminOpsSection title="Детализация по моделям" actionHref="/admin/ai" actionLabel="Стоимость моделей">
        <div className="overflow-x-auto">
          <table className="soft-admin-table min-w-[980px]">
            <thead>
              <tr>
                <th>Продукт</th>
                <th>Провайдер</th>
                <th>Модель</th>
                <th>Статус</th>
                <th>Запросы</th>
                <th>Токены</th>
                <th>Стоимость</th>
                <th>Время ответа</th>
              </tr>
            </thead>
            <tbody>
              {data.usageDetails.map((row) => (
                <tr key={`${row.feature}-${row.provider}-${row.model}-${row.status}`}>
                  <td>{featureTitle(row.feature)}</td>
                  <td>{row.provider}</td>
                  <td>{row.model}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="tabular-nums">{formatNumber(row.requestCount)}</td>
                  <td className="tabular-nums">{formatNumber(row.totalTokens)}</td>
                  <td className="tabular-nums">{formatAdminAiCostRub(row.costMicros, currencyRates)}</td>
                  <td className="tabular-nums">{row.avgLatencyMs ? `${formatNumber(Math.round(row.avgLatencyMs))} ms` : "—"}</td>
                </tr>
              ))}
              {data.usageDetails.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-[var(--soft-ink-soft)]">Нет AI-запросов за выбранный день.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminOpsSection>

      {role === "SUPERADMIN" && (
        <AdminOpsSection title="Аудит пользовательских LLM-диалогов" actionHref="/admin/ai" actionLabel="Полный аудит">
          <div className="overflow-x-auto">
            <table className="soft-admin-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Продукт</th>
                  <th>Пользователь</th>
                  <th>Провайдер</th>
                  <th>Модель</th>
                  <th>Статус</th>
                  <th>Токены</th>
                  <th>Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {recentInteractions.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>{featureTitle(row.feature)}</td>
                    <td>{row.userLabel ?? row.userId ?? "—"}</td>
                    <td>{row.responseProvider ?? "—"}</td>
                    <td>{row.responseModel ?? "—"}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="tabular-nums">{formatNumber(row.totalTokens)}</td>
                    <td className="tabular-nums">{formatAdminAiCostRub(row.estimatedCostMicros, currencyRates)}</td>
                  </tr>
                ))}
                {recentInteractions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-sm text-[var(--soft-ink-soft)]">
                      Аудит диалогов пуст или скрыт настройками доступа.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminOpsSection>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="soft-admin-action" href="/admin/ai">Управление AI-центром</Link>
        <Link className="soft-admin-action" href="/admin/ops">Операционный центр</Link>
      </div>
    </PageContainer>
  );
}
