export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BrainCircuit, Clock3, CircleDollarSign, Gauge, Hash } from "lucide-react";
import { auth } from "@/lib/auth";
import { getAIControlCenterData } from "@/lib/ai-gateway/admin-config";
import { listAdminAIInteractions } from "@/lib/ai-gateway/interactions";
import { getAIUsageDetailsForRange } from "@/lib/ai-gateway/usage";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { PageContainer } from "@/components/ui/page-container";
import { formatAdminAiCost, formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../../admin-currency";
import { AdminCurrencySelector } from "../../admin-currency-selector";
import { PeriodToolbar, statusLabel } from "../../admin-analytics-ui";
import { productLabel, resolveAdminPeriod } from "../../admin-analytics-data";
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
    "human-design": "Дизайн человека",
    "surname-story": "История фамилии",
  };
  const key = Object.keys(known).find((item) => feature.includes(item));
  return key ? known[key] : productLabel(feature);
}

function statusTone(value: number) {
  if (value >= 10) return "danger" as const;
  if (value > 0) return "warn" as const;
  return "ok" as const;
}

function rowStatusTone(status: string) {
  if (/SUCCESS|OK|COMPLETED/i.test(status)) return "ok" as const;
  if (/ERROR|FAIL|TIMEOUT|CANCEL/i.test(status)) return "danger" as const;
  return "warn" as const;
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((value) => ({ value, label: value }));
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
  const currency = resolveAdminCurrency(params);
  const [data, currencyRates, usageDetails, interactions] = await Promise.all([
    getAIControlCenterData(period.endInput, { includeSecrets: false }),
    getAdminCurrencyRates(),
    getAIUsageDetailsForRange({ start: period.start, end: period.end }),
    role === "SUPERADMIN"
      ? listAdminAIInteractions({ start: period.start, end: period.end, limit: 80 })
      : Promise.resolve([]),
  ]);
  const totals = usageDetails.reduce(
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

  const byFeatureMap = usageDetails.reduce((map, row) => {
    const current = map.get(row.feature) ?? { feature: row.feature, requests: 0, tokens: 0, cost: 0, errors: 0 };
    current.requests += row.requestCount;
    current.tokens += row.totalTokens;
    current.cost += row.costMicros;
    current.errors += Math.max(row.attemptCount - row.successCount, 0);
    map.set(row.feature, current);
    return map;
  }, new Map<string, { feature: string; requests: number; tokens: number; cost: number; errors: number }>());
  const byFeature = Array.from(byFeatureMap.values()).sort((a, b) => b.cost - a.cost);

  const byProviderMap = usageDetails.reduce((map, row) => {
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
  const recentInteractions = interactions.slice(0, 12);
  const modelDetailColumns: AdminCompactColumn[] = [
    { key: "product", label: "Продукт", sortable: true, options: uniqueOptions(usageDetails.map((row) => featureTitle(row.feature))) },
    { key: "provider", label: "Провайдер", sortable: true, options: uniqueOptions(usageDetails.map((row) => row.provider)) },
    { key: "model", label: "Модель", sortable: true, filterKind: "text" },
    { key: "status", label: "Статус", sortable: true, options: uniqueOptions(usageDetails.map((row) => statusLabel(row.status))) },
    { key: "requests", label: "Запросы", sortable: true, filterKind: "text", align: "right" },
    { key: "tokens", label: "Токены", sortable: true, filterKind: "text", align: "right" },
    { key: "cost", label: "Стоимость", sortable: true, filterKind: "text", align: "right" },
    { key: "latency", label: "Время ответа", sortable: true, filterKind: "text", align: "right" },
  ];
  const modelDetailRows = usageDetails.map((row) => {
    const product = featureTitle(row.feature);
    const status = statusLabel(row.status);
    return {
      id: `${row.feature}-${row.provider}-${row.model}-${row.status}`,
      cells: {
        product: { value: product, filterValue: `${product} ${row.feature}`, sortValue: product },
        provider: row.provider,
        model: row.model,
        status: { kind: "status" as const, label: status, tone: rowStatusTone(row.status), filterValue: status, sortValue: status },
        requests: { value: formatNumber(row.requestCount), filterValue: String(row.requestCount), sortValue: row.requestCount },
        tokens: { value: formatNumber(row.totalTokens), filterValue: String(row.totalTokens), sortValue: row.totalTokens },
        cost: {
          value: formatAdminAiCost(row.costMicros, currencyRates, currency),
          filterValue: String(row.costMicros),
          sortValue: row.costMicros,
        },
        latency: {
          value: row.avgLatencyMs ? `${formatNumber(Math.round(row.avgLatencyMs))} ms` : "—",
          filterValue: row.avgLatencyMs ? String(Math.round(row.avgLatencyMs)) : "",
          sortValue: row.avgLatencyMs ?? 0,
        },
      },
    };
  });
  const interactionColumns: AdminCompactColumn[] = [
    { key: "time", label: "Время", sortable: true, filterKind: "date" },
    { key: "product", label: "Продукт", sortable: true, options: uniqueOptions(recentInteractions.map((row) => featureTitle(row.feature))) },
    { key: "user", label: "Пользователь", sortable: true, filterKind: "text" },
    { key: "provider", label: "Провайдер", sortable: true, options: uniqueOptions(recentInteractions.map((row) => row.responseProvider ?? "—")) },
    { key: "model", label: "Модель", sortable: true, filterKind: "text" },
    { key: "status", label: "Статус", sortable: true, options: uniqueOptions(recentInteractions.map((row) => statusLabel(row.status))) },
    { key: "tokens", label: "Токены", sortable: true, filterKind: "text", align: "right" },
    { key: "cost", label: "Стоимость", sortable: true, filterKind: "text", align: "right" },
  ];
  const interactionRows = recentInteractions.map((row) => {
    const product = featureTitle(row.feature);
    const status = statusLabel(row.status);
    const time = formatDateTime(row.createdAt);
    const user = row.userLabel ?? row.userId ?? "—";
    return {
      id: row.id,
      cells: {
        time: { value: time, filterValue: time, sortValue: new Date(row.createdAt).getTime() },
        product: { value: product, filterValue: `${product} ${row.feature}`, sortValue: product },
        user: { value: user, title: user, filterValue: user, sortValue: user },
        provider: row.responseProvider ?? "—",
        model: row.responseModel ?? "—",
        status: { kind: "status" as const, label: status, tone: rowStatusTone(row.status), filterValue: status, sortValue: status },
        tokens: { value: formatNumber(row.totalTokens), filterValue: String(row.totalTokens), sortValue: row.totalTokens },
        cost: {
          value: formatAdminAiCost(row.estimatedCostMicros, currencyRates, currency),
          filterValue: String(row.estimatedCostMicros),
          sortValue: row.estimatedCostMicros,
        },
      },
    };
  });

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
        <div className="flex flex-wrap items-center gap-2">
          <AdminCurrencySelector basePath="/admin/ops/ai-cost" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} />
          <PeriodToolbar basePath="/admin/ops/ai-cost" start={period.startInput} end={period.endInput} />
        </div>
      </div>
      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <AdminOpsMetric icon={CircleDollarSign} label="Расход" value={formatAdminAiCost(totals.cost, currencyRates, currency)} hint="Факт по стоимости моделей AI-центра" tone={totals.cost > 0 ? "neutral" : "ok"} />
        <AdminOpsMetric icon={Hash} label="Токены" value={formatNumber(totals.tokens)} hint={`${formatNumber(totals.prompt)} входящих, ${formatNumber(totals.completion)} исходящих`} />
        <AdminOpsMetric icon={BrainCircuit} label="Запросы" value={formatNumber(totals.requests)} hint={`${formatNumber(totals.attempts)} попыток маршрутизации`} />
        <AdminOpsMetric icon={AlertTriangle} label="Ошибки" value={formatPercent(errorRate)} hint={`${formatNumber(errors)} неуспешных попыток`} tone={statusTone(errorRate)} />
        <AdminOpsMetric icon={Clock3} label="Время ответа" value={`${formatNumber(avgLatency)} ms`} hint="Среднее, взвешенное по числу запросов" tone={avgLatency > 10_000 ? "warn" : "ok"} />
        <AdminOpsMetric icon={Gauge} label="Модели" value={formatNumber(Object.values(data.models).flat().length)} hint={`${formatNumber(data.providers.filter((row) => row.enabled).length)} провайдеров включено`} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminOpsSection title="Расход по продуктам" actionHref="/admin/ops/ai" actionLabel="Настроить маршруты">
          <div className="space-y-3">
            {byFeature.length === 0 && <p className="text-sm text-[var(--soft-ink-soft)]">За выбранный период расход не найден.</p>}
            {byFeature.map((row) => (
              <div key={row.feature}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{featureTitle(row.feature)}</span>
                  <span className="tabular-nums text-[var(--soft-bordeaux)]">{formatAdminAiCost(row.cost, currencyRates, currency)}</span>
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

        <AdminOpsSection title="Расход по провайдерам" actionHref="/admin/ops/ai" actionLabel="Открыть AI-центр">
          <div className="space-y-3">
            {byProvider.length === 0 && <p className="text-sm text-[var(--soft-ink-soft)]">За выбранный период провайдеры не списывали токены.</p>}
            {byProvider.map((row) => (
              <div key={row.provider}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{row.provider}</span>
                  <span className="tabular-nums text-[var(--soft-bordeaux)]">{formatAdminAiCost(row.cost, currencyRates, currency)}</span>
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

      <div className="mt-4 grid gap-4">
      <AdminOpsSection title="Детализация по моделям" actionHref="/admin/ops/ai" actionLabel="Стоимость моделей">
        <AdminCompactDataTable
          columns={modelDetailColumns}
          rows={modelDetailRows}
          empty="Нет AI-запросов за выбранный период."
          minWidth="1180px"
          pageSize={20}
        />
      </AdminOpsSection>

      {role === "SUPERADMIN" && (
        <AdminOpsSection title="Аудит пользовательских LLM-диалогов" actionHref="/admin/ops/ai" actionLabel="Полный аудит">
          <AdminCompactDataTable
            columns={interactionColumns}
            rows={interactionRows}
            empty="Аудит диалогов пуст или скрыт настройками доступа."
            minWidth="1180px"
            pageSize={20}
          />
        </AdminOpsSection>
      )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="soft-admin-action" href="/admin/ops/ai">Управление AI-центром</Link>
        <Link className="soft-admin-action" href="/admin/ops">Операционный центр</Link>
      </div>
    </PageContainer>
  );
}
