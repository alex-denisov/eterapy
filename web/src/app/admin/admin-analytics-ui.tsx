import Link from "next/link";
import type { ReactNode } from "react";
import { AdminPeriodToolbar } from "./admin-period-toolbar";

export type ChartPoint = {
  label: string;
  value: number;
  secondary?: number;
  tertiary?: number;
  segments?: Array<{ label: string; value: number; color?: string }>;
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
    TIMEOUT: "Таймаут",
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
    <section id={id} className="min-w-0 scroll-mt-24 overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
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

type ChartSeriesKey = "value" | "secondary" | "tertiary";
type ChartSeries = { key: ChartSeriesKey; label: string; color: string };

export const CHART_KIT_PALETTE = ["#2563EB", "#14B8A6", "#F59E0B", "#BE185D", "#7C3AED", "#64748B", "#0F766E", "#DC2626"];
const CHART_KIT_GRID = "#E5EAF3";
const CHART_KIT_AXIS = "#AAB6C8";

function chartSeries(data: ChartPoint[], labels?: [string, string?, string?]): ChartSeries[] {
  return [
    { key: "value", label: labels?.[0] ?? "Значение", color: CHART_KIT_PALETTE[0] },
    ...(data.some((item) => item.secondary !== undefined)
      ? [{ key: "secondary" as const, label: labels?.[1] ?? "Дополнительно", color: CHART_KIT_PALETTE[1] }]
      : []),
    ...(data.some((item) => item.tertiary !== undefined)
      ? [{ key: "tertiary" as const, label: labels?.[2] ?? "Третий показатель", color: CHART_KIT_PALETTE[2] }]
      : []),
  ];
}

function chartCardClass() {
  return "min-w-0 max-w-full overflow-hidden rounded-lg border border-[#D6DEE9] bg-white p-4 shadow-[0_16px_46px_-36px_rgba(15,23,42,0.55)]";
}

function axisSlotWidth(labels: string[], baseWidth: number) {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.max(baseWidth, Math.ceil(longest * 6.8) + 18);
}

function tooltipSize(text: string) {
  return {
    width: Math.max(178, Math.ceil(text.length * 6.7) + 30),
    height: 32,
  };
}

function axisLabelLayout(labels: string[], slotWidth: number) {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  const requiredSlotWidth = Math.ceil(longest * 6.8) + 18;
  return {
    vertical: false,
    bottom: 26,
    slotWidth: Math.max(slotWidth, requiredSlotWidth),
  };
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
  const series = chartSeries(data, seriesLabels);
  const left = 58;
  const right = 16;
  const top = 12;
  const plotHeight = 212;
  const compactLabels = data.length > 18;
  const labels = data.map((item) => item.label);
  const groupWidth = axisSlotWidth(
    labels,
    compactLabels ? (series.length > 1 ? 38 : 32) : (series.length > 1 ? 52 : 44),
  );
  const labelLayout = axisLabelLayout(labels, groupWidth);
  const resolvedGroupWidth = labelLayout.slotWidth;
  const bottom = labelLayout.bottom;
  const widestTooltip = Math.max(...data.flatMap((item) => series.map((seriesItem) => {
    const raw = Math.max(0, Number(item[seriesItem.key] ?? 0));
    return tooltipSize(`${item.label} · ${seriesItem.label}: ${formatValue(raw)}`).width;
  })), 172);
  const width = Math.max(760, left + right + data.length * resolvedGroupWidth, left + right + widestTooltip + 16);
  const height = top + plotHeight + bottom;
  const plotWidth = width - left - right;
  const tickValues = chartTickValues(max, integerTicks);
  const innerGap = 2;
  const barWidth = Math.max(3, Math.min(14, (groupWidth - 8 - innerGap * (series.length - 1)) / series.length));
  const totalBarsWidth = barWidth * series.length + innerGap * (series.length - 1);

  function yFor(value: number) {
    return top + plotHeight - (Math.max(0, value) / max) * plotHeight;
  }

  function buildVerticalTooltipHits() {
    return data.flatMap((item, index) => {
      const slotWidth = plotWidth / data.length;
      const groupX = left + index * slotWidth;
      const startX = groupX + (slotWidth - totalBarsWidth) / 2;
      return series.flatMap((seriesItem, seriesIndex) => {
        const raw = item[seriesItem.key] ?? 0;
        if (raw <= 0) return [];
        const barHeight = Math.max(2, (raw / max) * plotHeight);
        const x = startX + seriesIndex * (barWidth + innerGap);
        const y = top + plotHeight - barHeight;
        const tooltip = `${item.label} · ${seriesItem.label}: ${formatValue(raw)}`;
        const { width: tooltipWidth } = tooltipSize(tooltip);
        const tooltipX = Math.max(left + tooltipWidth / 2 + 4, Math.min(width - right - tooltipWidth / 2 - 4, x + barWidth / 2));
        const tooltipY = Math.max(top + 34, y - 7);
        return [{
          key: `${item.label}-${seriesItem.key}`,
          x,
          y,
          barHeight,
          tooltip,
          tooltipWidth,
          tooltipX,
          tooltipY,
        }];
      });
    });
  }

  return (
    <div className={chartCardClass()} data-testid="admin-vertical-bar-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {label ? <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[#0F172A]">{label}</p> : <span />}
        {series.length > 1 ? (
          <div className="flex flex-wrap gap-3 text-[10px] text-[#475569]">
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
          className="block max-w-none"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          data-testid="admin-vertical-bar-chart-svg"
          shapeRendering="geometricPrecision"
        >
          <rect x="0" y="0" width={width} height={height} rx="8" fill="transparent" pointerEvents="none" />
          {tickValues.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line className="soft-chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} stroke={CHART_KIT_GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={left - 8} y={y + 4} textAnchor="end" className="soft-chart-axis-label fill-[#475569] text-[12px] tabular-nums">
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}
          <line className="soft-chart-axis-line" x1={left} x2={left} y1={top} y2={top + plotHeight} stroke={CHART_KIT_AXIS} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line className="soft-chart-axis-line" x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke={CHART_KIT_AXIS} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {data.map((item, index) => {
            const slotWidth = plotWidth / data.length;
            const groupX = left + index * slotWidth;
            const centerX = groupX + slotWidth / 2;
            const startX = groupX + (slotWidth - totalBarsWidth) / 2;
            const axisLabelY = top + plotHeight + 14;
            return (
              <g key={item.label}>
                {series.map((seriesItem, seriesIndex) => {
                  const raw = item[seriesItem.key] ?? 0;
                  const barHeight = raw > 0 ? Math.max(2, (raw / max) * plotHeight) : 0;
                  const x = startX + seriesIndex * (barWidth + innerGap);
                  const y = top + plotHeight - barHeight;
                  return (
                    <g key={seriesItem.key}>
                      <rect
                        className="soft-chart-bar"
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx="3"
                        fill={seriesItem.color}
                        opacity={raw > 0 ? 0.96 : 0}
                      />
                    </g>
                  );
                })}
                <text
                  x={centerX}
                  y={axisLabelY}
                  textAnchor="middle"
                  className="soft-chart-axis-label fill-[#475569] text-[11px] tabular-nums"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
          <g className="soft-chart-tooltip-layer">
            {buildVerticalTooltipHits().map((hit) => (
              <g key={hit.key} className="soft-chart-hit" tabIndex={0} aria-label={hit.tooltip}>
                <rect
                  x={hit.x - 3}
                  y={top}
                  width={hit.barHeight > 0 ? barWidth + 6 : 0}
                  height={plotHeight}
                  fill="transparent"
                />
                <g className="soft-chart-tooltip" transform={`translate(${hit.tooltipX} ${hit.tooltipY})`}>
                  <rect x={-hit.tooltipWidth / 2} y="-32" width={hit.tooltipWidth} height="28" rx="7" />
                  <text x="0" y="-14" textAnchor="middle">{hit.tooltip}</text>
                </g>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function StackedBarChart({
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
  const hasSegments = data.some((item) => item.segments && item.segments.length > 0);
  const segmentLabels = hasSegments
    ? [...new Set(data.flatMap((item) => (item.segments ?? []).map((segment) => segment.label)))]
    : [];
  const series = hasSegments
    ? segmentLabels.map((segmentLabel, index) => ({ key: segmentLabel, label: segmentLabel, color: CHART_KIT_PALETTE[index % CHART_KIT_PALETTE.length] }))
    : chartSeries(data, seriesLabels).map((item) => ({ ...item, key: item.key as string }));
  const totals = data.map((item) => {
    if (hasSegments) return (item.segments ?? []).reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
    return chartSeries(data, seriesLabels).reduce((sum, seriesItem) => sum + Math.max(0, item[seriesItem.key] ?? 0), 0);
  });
  const rawMax = Math.max(maxValue ?? 0, ...totals, 1);
  const max = integerTicks ? Math.max(1, Math.ceil(rawMax)) : rawMax;
  const formatValue = valueFormatter ?? ((value: number) => `${formatNumber(value)}${unit ?? ""}`);
  if (data.length === 0) return <EmptyState />;
  if (!totals.some((value) => value > 0)) return <EmptyState>За выбранный период нет событий для графика</EmptyState>;

  const left = 58;
  const right = 16;
  const top = 12;
  const plotHeight = 212;
  const labels = data.map((item) => item.label);
  const slotWidth = axisSlotWidth(labels, data.length > 18 ? 34 : 42);
  const labelLayout = axisLabelLayout(labels, slotWidth);
  const resolvedSlotWidth = labelLayout.slotWidth;
  const bottom = labelLayout.bottom;
  const widestTooltip = Math.max(...data.flatMap((item, index) => series.map((seriesItem) => {
    const raw = hasSegments
      ? (item.segments ?? []).find((segment) => segment.label === seriesItem.label)?.value ?? 0
      : Number(item[seriesItem.key as ChartSeriesKey] ?? 0);
    return tooltipSize(`${item.label} · ${seriesItem.label}: ${formatValue(raw)} · всего ${formatValue(totals[index] ?? 0)}`).width;
  })), 172);
  const width = Math.max(760, left + right + data.length * resolvedSlotWidth, left + right + widestTooltip + 16);
  const height = top + plotHeight + bottom;
  const plotWidth = width - left - right;
  const tickValues = chartTickValues(max, integerTicks);
  const barWidth = Math.max(7, Math.min(20, slotWidth * 0.56));

  function yFor(value: number) {
    return top + plotHeight - (Math.max(0, value) / max) * plotHeight;
  }

  function buildStackedTooltipHits() {
    return data.flatMap((item, index) => {
      const currentSlotWidth = plotWidth / data.length;
      const groupX = left + index * currentSlotWidth;
      const centerX = groupX + currentSlotWidth / 2;
      const x = centerX - barWidth / 2;
      let accumulated = 0;
      const total = totals[index] ?? 0;

      return series.flatMap((seriesItem) => {
        const segmentedValue = hasSegments
          ? (item.segments ?? []).find((segment) => segment.label === seriesItem.label)?.value ?? 0
          : Number(item[seriesItem.key as ChartSeriesKey] ?? 0);
        const raw = Math.max(0, segmentedValue);
        const from = accumulated;
        accumulated += raw;
        if (raw <= 0) return [];
        const y = yFor(accumulated);
        const previousY = yFor(from);
        const segmentHeight = Math.max(2, previousY - y);
        const tooltip = `${item.label} · ${seriesItem.label}: ${formatValue(raw)} · всего ${formatValue(total)}`;
        const { width: tooltipWidth } = tooltipSize(tooltip);
        const tooltipX = Math.max(left + tooltipWidth / 2 + 4, Math.min(width - right - tooltipWidth / 2 - 4, centerX));
        const tooltipY = Math.max(top + 34, y - 7);
        return [{
          key: `${item.label}-${seriesItem.key}`,
          x,
          y,
          segmentHeight,
          tooltip,
          tooltipWidth,
          tooltipX,
          tooltipY,
        }];
      });
    });
  }

  return (
    <div className={chartCardClass()} data-testid="admin-stacked-bar-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {label ? <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[#0F172A]">{label}</p> : <span />}
        <div className="flex flex-wrap gap-3 text-[10px] text-[#475569]">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={label ?? "Гистограмма с накоплением"}
          className="block max-w-none"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          data-testid="admin-stacked-bar-chart-svg"
          shapeRendering="geometricPrecision"
        >
          <rect x="0" y="0" width={width} height={height} rx="8" fill="transparent" pointerEvents="none" />
          {tickValues.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line className="soft-chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} stroke={CHART_KIT_GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={left - 8} y={y + 4} textAnchor="end" className="soft-chart-axis-label fill-[#475569] text-[12px] tabular-nums">
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}
          <line className="soft-chart-axis-line" x1={left} x2={left} y1={top} y2={top + plotHeight} stroke={CHART_KIT_AXIS} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line className="soft-chart-axis-line" x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke={CHART_KIT_AXIS} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {data.map((item, index) => {
            const currentSlotWidth = plotWidth / data.length;
            const groupX = left + index * currentSlotWidth;
            const centerX = groupX + currentSlotWidth / 2;
            const x = centerX - barWidth / 2;
            let accumulated = 0;
            return (
              <g key={item.label}>
                {series.map((seriesItem) => {
                  const segmentedValue = hasSegments
                    ? (item.segments ?? []).find((segment) => segment.label === seriesItem.label)?.value ?? 0
                    : Number(item[seriesItem.key as ChartSeriesKey] ?? 0);
                  const raw = Math.max(0, segmentedValue);
                  const from = accumulated;
                  accumulated += raw;
                  if (raw <= 0) return null;
                  const y = yFor(accumulated);
                  const previousY = yFor(from);
                  const segmentHeight = Math.max(2, previousY - y);
                      return (
                    <g key={seriesItem.key}>
                      <rect
                        className="soft-chart-bar"
                        x={x}
                        y={y}
                        width={barWidth}
                        height={segmentHeight}
                        rx="2.5"
                        fill={seriesItem.color}
                        opacity={0.96}
                      />
                    </g>
                  );
                })}
                <text
                  x={centerX}
                  y={top + plotHeight + 14}
                  textAnchor="middle"
                  className="soft-chart-axis-label fill-[#475569] text-[11px] tabular-nums"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
          <g className="soft-chart-tooltip-layer">
            {buildStackedTooltipHits().map((hit) => (
              <g key={hit.key} className="soft-chart-hit" tabIndex={0} aria-label={hit.tooltip}>
                <rect
                  x={hit.x - 4}
                  y={hit.y}
                  width={barWidth + 8}
                  height={hit.segmentHeight}
                  fill="transparent"
                />
                <g className="soft-chart-tooltip" transform={`translate(${hit.tooltipX} ${hit.tooltipY})`}>
                  <rect x={-hit.tooltipWidth / 2} y="-32" width={hit.tooltipWidth} height="28" rx="7" />
                  <text x="0" y="-14" textAnchor="middle">{hit.tooltip}</text>
                </g>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function HorizontalBars({ data, unit }: { data: ChartPoint[]; unit?: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="space-y-3 rounded-lg border border-[#D6DEE9] bg-white p-4 shadow-[0_16px_46px_-36px_rgba(15,23,42,0.45)]">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-[#0F172A]">{item.label}</span>
            <span className="tabular-nums text-[#475569]">{formatNumber(item.value)}{unit ?? ""}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#EEF2F7]">
            <div
              className="soft-chart-html-hit relative h-2.5 rounded-full"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, backgroundColor: CHART_KIT_PALETTE[0] }}
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
    <div className="rounded-lg border border-[#D6DEE9] bg-white p-4 shadow-[0_16px_46px_-36px_rgba(15,23,42,0.45)]">
      {data.map((item, index) => {
        const width = Math.max(18, Math.min(100, (item.value / first) * 100));
        const conversion = index === 0 ? 100 : (item.value / first) * 100;
        return (
          <div key={item.label} className="grid grid-cols-[9rem_1fr_4rem] items-center gap-3 py-1.5">
            <div className="truncate text-xs font-semibold text-[#0F172A]">{item.label}</div>
            <div className="flex justify-center">
              <div
                className="soft-chart-html-hit relative flex h-11 items-center justify-center rounded-sm px-3 text-xs font-semibold text-white shadow-sm"
                style={{
                  width: `${width}%`,
                  clipPath: "polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%)",
                  backgroundColor: CHART_KIT_PALETTE[index % CHART_KIT_PALETTE.length],
                  opacity: 1 - index * 0.07,
                }}
                tabIndex={0}
                aria-label={`${item.label}: ${formatNumber(item.value)} · ${formatPercent(conversion)}`}
              >
                {formatNumber(item.value)}
                <span className="soft-chart-tooltip-html">{item.label}: {formatNumber(item.value)} · {formatPercent(conversion)}</span>
              </div>
            </div>
            <div className="text-right text-xs font-semibold tabular-nums text-[#475569]">{formatPercent(conversion)}</div>
          </div>
        );
      })}
    </div>
  );
}
