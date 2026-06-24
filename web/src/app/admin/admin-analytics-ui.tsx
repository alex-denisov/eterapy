import Link from "next/link";
import type { ReactNode } from "react";

export type ChartPoint = {
  label: string;
  value: number;
  secondary?: number;
  tertiary?: number;
};

export type MetricTone = "neutral" | "ok" | "warn" | "danger";

const toneClass: Record<MetricTone, string> = {
  neutral: "text-[var(--soft-bordeaux)]",
  ok: "text-emerald-700",
  warn: "text-[var(--soft-terracotta-dark)]",
  danger: "text-red-700",
};

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

export function formatRub(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatUsdMicros(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value / 1_000_000);
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function cardMask(first6?: string | null, last4?: string | null) {
  const bin = first6?.replace(/\D/g, "").slice(0, 6);
  const tail = last4?.replace(/\D/g, "").slice(-4);
  if (!bin || !tail) return "—";
  return `${bin.slice(0, 4)} ${bin.slice(4, 6)}** **** ${tail}`;
}

export function AdminHero({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="premium-eyebrow">{eyebrow}</p>
        <h1 className="premium-title mt-2 text-3xl md:text-4xl">{title}</h1>
        {children ? <div className="mt-2 text-sm text-[var(--soft-ink-soft)]">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PeriodToolbar({
  basePath,
  start,
  end,
}: {
  basePath: string;
  start: string;
  end: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {[
        ["today", "Сегодня"],
        ["week", "Неделя"],
        ["month", "Месяц"],
        ["quarter", "Квартал"],
      ].map(([period, label]) => (
        <Link key={period} className="soft-admin-action" data-variant="subtle" href={`${basePath}?period=${period}`}>
          {label}
        </Link>
      ))}
      <form className="flex flex-wrap items-center gap-2" action={basePath}>
        <input type="date" name="start" defaultValue={start} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 py-1" />
        <span className="text-[var(--soft-ink-faint)]">—</span>
        <input type="date" name="end" defaultValue={end} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 py-1" />
        <button className="soft-admin-action" type="submit">Применить</button>
      </form>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: MetricTone;
}) {
  const body = (
    <>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[var(--soft-ink-faint)]">{label}</p>
      <p className={`mt-2 font-heading text-2xl font-semibold tabular-nums ${toneClass[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{hint}</p> : null}
    </>
  );
  const className = "block rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)] transition-colors hover:border-[var(--soft-bordeaux)]";
  return href ? <Link className={className} href={href}>{body}</Link> : <div className={className}>{body}</div>;
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function AnalyticsSection({
  id,
  title,
  children,
  actionHref,
  actionLabel,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{title}</h2>
        {actionHref && actionLabel ? <Link className="soft-admin-action" href={actionHref}>{actionLabel}</Link> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children = "Нет данных за выбранный период" }: { children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-4 py-8 text-center text-sm text-[var(--soft-ink-soft)]">
      {children}
    </div>
  );
}

export function VerticalBarChart({
  data,
  unit,
  label,
  maxValue,
}: {
  data: ChartPoint[];
  unit?: string;
  label?: string;
  maxValue?: number;
}) {
  const max = Math.max(maxValue ?? 0, ...data.flatMap((item) => [item.value, item.secondary ?? 0, item.tertiary ?? 0]), 1);
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
      {label ? <p className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--soft-ink-faint)]">{label}</p> : null}
      <div className="relative h-64 border-l border-b border-[var(--soft-paper-edge)] pl-3">
        <div className="pointer-events-none absolute inset-x-3 top-0 grid h-full grid-rows-4 text-[10px] text-[var(--soft-ink-faint)]">
          {[max, max * 0.75, max * 0.5, max * 0.25].map((tick) => (
            <div key={tick} className="border-t border-[var(--soft-paper-edge)]">
              <span className="-ml-3 -translate-y-2 bg-[var(--soft-surface)] pr-1 tabular-nums">{formatNumber(tick)}{unit ?? ""}</span>
            </div>
          ))}
        </div>
        <div className="relative z-10 flex h-full items-end gap-1 overflow-x-auto pb-7">
          {data.map((item) => (
            <div key={item.label} className="flex min-w-7 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <span title={`${item.label}: ${formatNumber(item.value)}${unit ?? ""}`} className="w-2 rounded-t bg-[var(--soft-bordeaux)]" style={{ height: `${Math.max(2, (item.value / max) * 100)}%` }} />
                {item.secondary !== undefined ? <span title={`${item.label}: ${formatNumber(item.secondary)}${unit ?? ""}`} className="w-2 rounded-t bg-[var(--soft-terracotta)]" style={{ height: `${Math.max(2, (item.secondary / max) * 100)}%` }} /> : null}
                {item.tertiary !== undefined ? <span title={`${item.label}: ${formatNumber(item.tertiary)}${unit ?? ""}`} className="w-2 rounded-t bg-emerald-600" style={{ height: `${Math.max(2, (item.tertiary / max) * 100)}%` }} /> : null}
              </div>
              <span className="absolute bottom-1 origin-left rotate-[-35deg] text-[10px] text-[var(--soft-ink-faint)]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HorizontalBars({ data, unit }: { data: ChartPoint[]; unit?: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-[var(--soft-ink)]">{item.label}</span>
            <span className="tabular-nums text-[var(--soft-ink-soft)]">{formatNumber(item.value)}{unit ?? ""}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--soft-paper-edge)]">
            <div className="h-2 rounded-full bg-[var(--soft-bordeaux)]" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FunnelChart({ data }: { data: ChartPoint[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="space-y-2">
      {data.map((item, index) => {
        const width = Math.max(24, (item.value / max) * 100);
        return (
          <div key={item.label} className="flex items-center gap-3">
            <div className="w-40 shrink-0 text-xs text-[var(--soft-ink-soft)]">{item.label}</div>
            <div className="flex-1">
              <div className="flex h-10 items-center justify-center rounded-md bg-[var(--soft-bordeaux)] px-3 text-xs font-semibold text-white shadow-sm" style={{ width: `${width}%`, opacity: 1 - index * 0.08 }}>
                {formatNumber(item.value)}
              </div>
            </div>
            <div className="w-16 text-right text-xs tabular-nums text-[var(--soft-ink-faint)]">
              {index === 0 ? "100%" : formatPercent((item.value / max) * 100)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: ReactNode[][];
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)]">
      <table className="soft-admin-data-table min-w-full">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          )) : (
            <tr><td colSpan={columns.length}>{empty ?? "Нет данных"}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
