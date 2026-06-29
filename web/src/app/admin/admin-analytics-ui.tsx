import Link from "next/link";
import type { ReactNode } from "react";
import { AdminPeriodToolbar } from "./admin-period-toolbar";

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

export function formatCompactRub(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
}

function chartTickValues(maxValue: number, integerTicks: boolean) {
  const max = integerTicks ? Math.max(1, Math.ceil(maxValue)) : maxValue;
  if (!integerTicks) return [max, max * 0.75, max * 0.5, max * 0.25, 0];
  if (max <= 6) return Array.from({ length: max + 1 }, (_, index) => max - index);
  return [...new Set([max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0])]
    .sort((a, b) => b - a);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function statusLabel(status: string | null | undefined) {
  if (!status) return "—";
  const labels: Record<string, string> = {
    SUCCEEDED: "Успешно",
    PENDING: "Ожидает",
    PROCESSING: "В обработке",
    CANCELLED: "Отменено",
    FAILED: "Ошибка",
    DEAD: "Не восстановлено",
    RUNNING: "В работе",
    REFUNDED: "Возврат",
    DISPUTED: "Спор",
    READY: "Готово",
    CREATED: "Создано",
    ACTIVE: "Активно",
    WAITING: "Ожидает",
    COMPLETED: "Завершено",
    HIDDEN: "Скрыто",
    REVIEW: "На проверке",
    PUBLISHED: "Опубликовано",
    BLOCKED: "Заблокировано",
    REWARDED: "Вознаграждено",
    REWARD_PENDING: "Ожидает бонус",
    REWARD_CONFIRMED: "Бонус подтвержден",
  };
  return labels[status] ?? status;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "";
  const tone = ["SUCCEEDED", "READY", "ACTIVE", "COMPLETED", "PUBLISHED", "REWARDED", "REWARD_CONFIRMED"].includes(value)
    ? "ok"
    : ["FAILED", "DEAD", "DISPUTED", "BLOCKED"].includes(value)
      ? "danger"
      : ["PENDING", "PROCESSING", "RUNNING", "REVIEW", "WAITING", "REWARD_PENDING"].includes(value)
        ? "warn"
        : "neutral";
  return <span className="soft-admin-status-pill" data-tone={tone}>{statusLabel(status)}</span>;
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
  return <AdminPeriodToolbar basePath={basePath} start={start} end={end} />;
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
  seriesLabels,
  valueFormatter,
  integerTicks = false,
}: {
  data: ChartPoint[];
  unit?: string;
  label?: string;
  maxValue?: number;
  seriesLabels?: [string, string?, string?];
  valueFormatter?: (value: number) => string;
  integerTicks?: boolean;
}) {
  const rawMax = Math.max(maxValue ?? 0, ...data.flatMap((item) => [item.value, item.secondary ?? 0, item.tertiary ?? 0]), 1);
  const max = integerTicks ? Math.max(1, Math.ceil(rawMax)) : rawMax;
  const formatValue = valueFormatter ?? ((value: number) => `${formatNumber(value)}${unit ?? ""}`);
  if (data.length === 0) return <EmptyState />;
  const hasValues = data.some((item) => item.value > 0 || (item.secondary ?? 0) > 0 || (item.tertiary ?? 0) > 0);
  if (!hasValues) return <EmptyState>За выбранный период нет событий для графика</EmptyState>;
  const series = [
    { key: "value" as const, label: seriesLabels?.[0] ?? "Значение", color: "var(--soft-bordeaux)" },
    ...(data.some((item) => item.secondary !== undefined) ? [{ key: "secondary" as const, label: seriesLabels?.[1] ?? "Дополнительно", color: "var(--soft-terracotta)" }] : []),
    ...(data.some((item) => item.tertiary !== undefined) ? [{ key: "tertiary" as const, label: seriesLabels?.[2] ?? "Третий показатель", color: "rgb(4 120 87)" }] : []),
  ];
  const left = 58;
  const right = 16;
  const top = 12;
  const plotHeight = 212;
  const verticalLabels = data.length > 18;
  const bottom = verticalLabels ? 66 : 34;
  const groupWidth = verticalLabels ? (series.length > 1 ? 34 : 24) : (series.length > 1 ? 48 : 42);
  const width = Math.max(760, left + right + data.length * groupWidth);
  const height = top + plotHeight + bottom;
  const plotWidth = width - left - right;
  const tickValues = chartTickValues(max, integerTicks);
  const innerGap = 2;
  const barWidth = Math.max(3, Math.min(14, (groupWidth - 8 - innerGap * (series.length - 1)) / series.length));
  const totalBarsWidth = barWidth * series.length + innerGap * (series.length - 1);

  function yFor(value: number) {
    return top + plotHeight - (Math.max(0, value) / max) * plotHeight;
  }

  return (
    <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4" data-testid="admin-vertical-bar-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {label ? <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--soft-ink-faint)]">{label}</p> : <span />}
        {series.length > 1 ? (
          <div className="flex flex-wrap gap-3 text-[10px] text-[var(--soft-ink-soft)]">
            {series.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1">
                <i className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={label ?? "Гистограмма"}
          className="block min-h-[272px] w-full min-w-[760px]"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          data-testid="admin-vertical-bar-chart-svg"
        >
          <rect x="0" y="0" width={width} height={height} rx="8" fill="transparent" />
          {tickValues.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={left} x2={width - right} y1={y} y2={y} stroke="var(--soft-paper-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={left - 8} y={y + 4} textAnchor="end" className="fill-[var(--soft-ink-faint)] text-[10px] tabular-nums">
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}
          <line x1={left} x2={left} y1={top} y2={top + plotHeight} stroke="var(--soft-paper-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke="var(--soft-paper-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {data.map((item, index) => {
            const slotWidth = plotWidth / data.length;
            const groupX = left + index * slotWidth;
            const centerX = groupX + slotWidth / 2;
            const startX = groupX + (slotWidth - totalBarsWidth) / 2;
            return (
              <g key={item.label}>
                {series.map((seriesItem, seriesIndex) => {
                  const raw = item[seriesItem.key] ?? 0;
                  const barHeight = raw > 0 ? Math.max(2, (raw / max) * plotHeight) : 0;
                  const x = startX + seriesIndex * (barWidth + innerGap);
                  const y = top + plotHeight - barHeight;
                  const tooltip = `${item.label} · ${seriesItem.label}: ${formatValue(raw)}`;
                  const tooltipWidth = Math.min(230, Math.max(124, tooltip.length * 5.8));
                  const tooltipX = Math.max(left + tooltipWidth / 2 + 4, Math.min(width - right - tooltipWidth / 2 - 4, x + barWidth / 2));
                  const tooltipY = Math.max(top + 28, y - 6);
                  return (
                    <g key={seriesItem.key} className="soft-chart-hit" tabIndex={raw > 0 ? 0 : undefined} aria-label={tooltip}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx="2"
                        fill={seriesItem.color}
                        opacity={raw > 0 ? 0.96 : 0}
                      />
                      {raw > 0 ? (
                        <g className="soft-chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`}>
                          <rect x={-tooltipWidth / 2} y="-25" width={tooltipWidth} height="22" rx="5" />
                          <text x="0" y="-10" textAnchor="middle">{tooltip}</text>
                        </g>
                      ) : null}
                    </g>
                  );
                })}
                <text
                  x={centerX}
                  y={verticalLabels ? top + plotHeight + 52 : top + plotHeight + 15}
                  textAnchor={verticalLabels ? "end" : "middle"}
                  transform={verticalLabels ? `rotate(-90 ${centerX} ${top + plotHeight + 52})` : undefined}
                  className="fill-[var(--soft-ink-faint)] text-[10px] tabular-nums"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
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
            <div
              className="soft-chart-html-hit relative h-2 rounded-full bg-[var(--soft-bordeaux)]"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
              tabIndex={0}
              aria-label={`${item.label}: ${formatNumber(item.value)}${unit ?? ""}`}
            >
              <span className="soft-chart-tooltip-html">{item.label}: {formatNumber(item.value)}{unit ?? ""}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FunnelChart({ data }: { data: ChartPoint[] }) {
  const first = Math.max(data[0]?.value ?? 0, 1);
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
      {data.map((item, index) => {
        const width = Math.max(18, Math.min(100, (item.value / first) * 100));
        const conversion = index === 0 ? 100 : (item.value / first) * 100;
        return (
          <div key={item.label} className="grid grid-cols-[9rem_1fr_4rem] items-center gap-3 py-1.5">
            <div className="text-xs text-[var(--soft-ink-soft)]">{item.label}</div>
            <div className="flex justify-center">
              <div
                className="soft-chart-html-hit relative flex h-11 items-center justify-center rounded-sm bg-[var(--soft-bordeaux)] px-3 text-xs font-semibold text-white shadow-sm"
                style={{
                  width: `${width}%`,
                  clipPath: "polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%)",
                  opacity: 1 - index * 0.07,
                }}
                tabIndex={0}
                aria-label={`${item.label}: ${formatNumber(item.value)} · ${formatPercent(conversion)}`}
              >
                {formatNumber(item.value)}
                <span className="soft-chart-tooltip-html">{item.label}: {formatNumber(item.value)} · {formatPercent(conversion)}</span>
              </div>
            </div>
            <div className="text-right text-xs tabular-nums text-[var(--soft-ink-faint)]">{formatPercent(conversion)}</div>
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
    <div className="max-w-full overflow-hidden rounded-lg border border-[var(--soft-paper-edge)]">
      <div className="max-w-full overflow-x-auto">
      <table className="soft-admin-data-table min-w-[980px]">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[28rem] whitespace-normal break-words">{cell}</td>)}</tr>
          )) : (
            <tr><td colSpan={columns.length}>{empty ?? "Нет данных"}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
