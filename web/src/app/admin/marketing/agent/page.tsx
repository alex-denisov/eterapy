export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Cable, SearchCheck, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { marketingAgentEnabled } from "@/lib/marketing/agent";
import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";
import { marketingConnectorStates } from "@/lib/marketing/discovery";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { AdminHero, AnalyticsSection, MetricCard, MetricGrid } from "../../admin-analytics-ui";
import { MarketingAgentControls } from "./agent-controls";

const dateTime = (value: Date | null) => value
  ? value.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short" })
  : "—";

export default async function MarketingAgentPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const [enabled, proposals, signals, recent] = await Promise.all([
    marketingAgentEnabled(),
    db.externalPublication.count({ where: { contentType: "COMMENT", status: "REVIEW" } }),
    db.marketingAutomationSignal.findMany({
      where: { status: "OPEN" },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      take: 100,
    }),
    db.externalPublication.findMany({
      where: { agentReviewedAt: { not: null } },
      orderBy: { agentReviewedAt: "desc" },
      take: 100,
    }),
  ]);
  const connectors = marketingConnectorStates();

  const runColumns: AdminCompactColumn[] = [
    { key: "time", label: "Время", sortable: true, filterKind: "date" },
    { key: "material", label: "Материал", sortable: true, filterKind: "text" },
    { key: "writer", label: "Автор", sortable: true, filterKind: "text" },
    { key: "reviewer", label: "Редактор", sortable: true, filterKind: "text" },
    { key: "status", label: "Результат", sortable: true, filterKind: "select" },
    { key: "review", label: "Проверка", filterKind: "none" },
  ];
  const runRows = recent.map((row) => ({
    id: row.id,
    cells: {
      time: { value: dateTime(row.agentReviewedAt), sortValue: row.agentReviewedAt?.getTime() ?? 0 },
      material: {
        value: row.title,
        subvalue: `${row.platform} · ${row.contentType}`,
        filterValue: `${row.title} ${row.platform} ${row.contentType}`,
      },
      writer: `${row.agentWriterProvider ?? "—"} / ${row.agentWriterModel ?? "—"}`,
      reviewer: `${row.agentReviewerProvider ?? "—"} / ${row.agentReviewerModel ?? "—"}`,
      status: {
        kind: "status" as const,
        label: row.status,
        tone: row.status === "FAILED" ? ("danger" as const) : row.status === "REVIEW" ? ("warn" as const) : ("ok" as const),
        filterValue: row.status,
      },
      review: {
        kind: "details" as const,
        label: "Показать",
        title: `Независимая проверка: ${row.title}`,
        body: row.agentReview ? JSON.stringify(row.agentReview, null, 2) : "Нет результата",
        meta: `${row.agentReviewerProvider ?? "—"} / ${row.agentReviewerModel ?? "—"}`,
      },
    },
  }));

  const signalColumns: AdminCompactColumn[] = [
    { key: "time", label: "Последнее событие", sortable: true, filterKind: "date" },
    { key: "severity", label: "Уровень", sortable: true, filterKind: "select" },
    { key: "kind", label: "Источник", sortable: true, filterKind: "select" },
    { key: "title", label: "Тикет / инцидент", sortable: true, filterKind: "text" },
    { key: "details", label: "Детали", filterKind: "none" },
  ];
  const signalRows = signals.map((row) => ({
    id: row.id,
    cells: {
      time: { value: dateTime(row.lastSeenAt), sortValue: row.lastSeenAt.getTime() },
      severity: {
        kind: "status" as const,
        label: row.severity,
        tone: row.severity === "INCIDENT" ? ("danger" as const) : row.severity === "WARNING" ? ("warn" as const) : ("neutral" as const),
        filterValue: row.severity,
      },
      kind: row.kind,
      title: {
        value: row.title,
        subvalue: row.suggestedTicket ? `предлагаемый тип: ${row.suggestedTicket}` : "наблюдение",
        filterValue: `${row.title} ${row.summary}`,
      },
      details: {
        kind: "details" as const,
        label: "Показать",
        title: row.title,
        body: row.summary,
        meta: `ключ ${row.key}`,
      },
    },
  }));

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="автономный SMM и SEO"
        title="Маркетинговый агент"
        actions={<MarketingAgentControls enabled={enabled} />}
      >
        Отдельный production-сервис создаёт и проверяет контент двумя разными
        моделями, ведёт SEO-аудит, ищет уместные обсуждения и создаёт сигналы.
        Комментарии к чужим материалам всегда ждут решения в служебном Telegram.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Сервис" value={enabled ? "работает" : "остановлен"} hint="переключатель хранится в БД" tone={enabled ? "ok" : "warn"} icon={<Bot className="size-4" />} />
        <MetricCard label="На премодерации" value={proposals.toLocaleString("ru-RU")} hint="рекламных комментариев" tone={proposals ? "warn" : "ok"} icon={<ShieldCheck className="size-4" />} />
        <MetricCard label="Открытые сигналы" value={signals.length.toLocaleString("ru-RU")} hint="SEO, адаптеры и сбои" tone={signals.length ? "warn" : "ok"} icon={<SearchCheck className="size-4" />} />
        <MetricCard label="Готовые коннекторы" value={`${connectors.filter((row) => row.ownedPublishing || row.comments).length}/${connectors.length}`} hint="секреты не показываются" icon={<Cable className="size-4" />} />
      </MetricGrid>

      <AnalyticsSection title="Площадки и возможности">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {connectors.map((connector) => (
            <article key={connector.platform} className="rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-[var(--soft-ink-strong)]">{connector.platform}</h3>
                <span className="soft-chip">{connector.missing.length ? "нужна настройка" : "готово"}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{connector.note}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div><dt className="text-[var(--soft-ink-faint)]">Свои посты</dt><dd>{connector.ownedPublishing ? "да" : "нет"}</dd></div>
                <div><dt className="text-[var(--soft-ink-faint)]">Поиск</dt><dd>{connector.discovery ? "да" : "нет"}</dd></div>
                <div><dt className="text-[var(--soft-ink-faint)]">Комментарии</dt><dd>{connector.comments ? "да" : "нет"}</dd></div>
              </dl>
              {connector.missing.length > 0 ? (
                <p className="mt-3 break-words text-[11px] text-[var(--soft-ink-faint)]">
                  Не заданы: {connector.missing.join(", ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </AnalyticsSection>

      <AnalyticsSection title="Последние циклы writer → reviewer">
        <p className="mb-3 text-sm text-[var(--soft-ink-soft)]">
          Провайдеры, модели, токены и полные AI-взаимодействия доступны в{" "}
          <Link className="font-semibold text-blue-700 hover:underline" href="/admin/ops/ai">
            центре управления моделями
          </Link>.
        </p>
        <AdminCompactDataTable columns={runColumns} rows={runRows} pageSize={25} minWidth="1250px" empty="Агент ещё не обрабатывал материалы" />
      </AnalyticsSection>

      <AnalyticsSection title="Автоматические тикеты и инциденты">
        <AdminCompactDataTable columns={signalColumns} rows={signalRows} pageSize={25} minWidth="1050px" empty="Открытых сигналов нет" />
      </AnalyticsSection>

      <AnalyticsSection title="Инструкция агента">
        <p className="mb-3 text-sm text-[var(--soft-ink-soft)]">
          Базовая инструкция версионируется вместе с кодом. Runtime-overrides для
          writer и reviewer управляются в центре AI.
        </p>
        <details className="rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4">
          <summary className="cursor-pointer font-semibold text-[var(--soft-ink-strong)]">Системный промпт writer</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--soft-ink-soft)]">{MARKETING_AGENT_SYSTEM_PROMPT}</pre>
        </details>
        <details className="mt-3 rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4">
          <summary className="cursor-pointer font-semibold text-[var(--soft-ink-strong)]">Системный промпт reviewer</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--soft-ink-soft)]">{MARKETING_REVIEWER_SYSTEM_PROMPT}</pre>
        </details>
      </AnalyticsSection>
    </main>
  );
}
