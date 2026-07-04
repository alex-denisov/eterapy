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
  neutral: "text-[#183B78]",
  ok: "text-emerald-700",
  warn: "text-amber-700",
  danger: "text-red-700",
};

const toneAccentClass: Record<MetricTone, string> = {
  neutral: "from-[#2563EB] to-[#14B8A6]",
  ok: "from-emerald-500 to-teal-500",
  warn: "from-amber-500 to-orange-500",
  danger: "from-red-500 to-rose-500",
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

function formatCompactAxisNumber(value: number) {
  const abs = Math.abs(value);
  const fractionDigits = abs >= 10 ? 0 : 1;
  if (abs >= 1_000_000_000) return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: fractionDigits }).format(value / 1_000_000_000)} млрд`;
  if (abs >= 1_000_000) return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: fractionDigits }).format(value / 1_000_000)} млн`;
  if (abs >= 10_000) return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: fractionDigits }).format(value / 1_000)} тыс`;
  return formatNumber(value);
}

export function formatChartAxisValue(value: number, unit?: string, valueFormatter?: (value: number) => string) {
  if (Math.abs(value) >= 10_000) {
    const formatted = valueFormatter ? valueFormatter(value) : "";
    const inferredUnit = unit?.trim()
      ?? (formatted.includes("₽") ? "₽" : formatted.includes("$") ? "$" : formatted.includes("%") ? "%" : "");
    return `${formatCompactAxisNumber(value)}${inferredUnit ? ` ${inferredUnit}` : ""}`;
  }
  return valueFormatter ? valueFormatter(value) : `${formatNumber(value)}${unit ?? ""}`;
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
    <>
      {actions ? <div className="soft-admin-sticky-controls mb-3 ml-auto flex w-fit flex-wrap items-center gap-1.5">{actions}</div> : null}
      <div className="mb-6 min-w-0">
        <p className="premium-eyebrow">{eyebrow}</p>
        <h1 className="premium-title mt-2 text-3xl md:text-4xl">{title}</h1>
        {children ? <div className="mt-2 text-sm text-[var(--soft-ink-soft)]">{children}</div> : null}
      </div>
    </>
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
  icon,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: MetricTone;
  icon?: ReactNode;
  delta?: string;
}) {
  const body = (
    <div className="relative min-h-[5.25rem] overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${toneAccentClass[tone]}`} />
      <div className="flex min-w-0 items-start justify-between gap-2 pt-2">
        <div className="min-w-0">
          <p className="truncate text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#64748B]" title={label}>{label}</p>
          <p className={`mt-1.5 font-sans text-[1.28rem] font-semibold leading-none tabular-nums ${toneClass[tone]}`}>{value}</p>
        </div>
        {icon ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#EFF6FF] text-[#2563EB]">{icon}</span> : null}
      </div>
      <div className="mt-2 flex min-h-[1.6rem] items-end justify-between gap-2">
        {hint ? <p className="line-clamp-2 text-[0.68rem] leading-snug text-[#475569]">{hint}</p> : <span />}
        {delta ? <span className="shrink-0 rounded-full bg-[#EEF2FF] px-1.5 py-0.5 text-[0.62rem] font-bold tabular-nums text-[#2563EB]">{delta}</span> : null}
      </div>
    </div>
  );
  const className = "soft-admin-kpi-card block min-w-0 rounded-lg border border-[#D6DEE9] bg-white px-3 py-2.5 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.65)] transition hover:-translate-y-0.5 hover:border-[#2563EB] hover:shadow-[0_18px_42px_-30px_rgba(37,99,235,0.35)]";
  return href ? <Link className={className} href={href}>{body}</Link> : <div className={className}>{body}</div>;
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 2xl:grid-cols-6">{children}</div>;
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
    <section id={id} className="soft-admin-bi-section min-w-0 scroll-mt-24 overflow-hidden rounded-lg border border-[#D6DEE9] bg-white/95 p-3.5 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.52)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-sans text-[0.92rem] font-bold uppercase tracking-[0.04em] text-[#0F172A]">{title}</h2>
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
  return "soft-admin-chart-card min-w-0 max-w-full overflow-visible rounded-lg border border-[#D6DEE9] bg-white p-3 shadow-[0_16px_46px_-36px_rgba(15,23,42,0.55)]";
}

function fixedChartWidth() {
  return 720;
}

function axisSlotWidth(labels: string[], plotWidth: number) {
  return Math.max(1, plotWidth / Math.max(labels.length, 1));
}

function tooltipSize(text: string) {
  return {
    width: Math.max(192, Math.ceil(text.length * 7.4) + 34),
    height: 34,
  };
}

function axisLabelStep(labels: string[], slotWidth: number) {
  if (labels.length <= 7) return 1;
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  const requiredSlotWidth = Math.ceil(longest * 6.2) + 18;
  if (requiredSlotWidth <= slotWidth) return 1;
  return Math.max(1, Math.ceil(requiredSlotWidth / Math.max(slotWidth, 1)));
}

function axisLabelLayout(labels: string[], slotWidth: number) {
  return {
    vertical: false,
    bottom: 20,
    slotWidth,
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
  const left = 64;
  const right = 14;
  const top = 8;
  const plotHeight = 176;
  const labels = data.map((item) => item.label);
  const width = fixedChartWidth();
  const plotWidth = width - left - right;
  const groupWidth = axisSlotWidth(labels, plotWidth);
  const labelLayout = axisLabelLayout(labels, groupWidth);
  const resolvedGroupWidth = labelLayout.slotWidth;
  const bottom = labelLayout.bottom;
  const height = top + plotHeight + bottom;
  const tickValues = chartTickValues(max, integerTicks);
  const innerGap = data.length > 120 ? 0.25 : data.length > 60 ? 0.6 : 2;
  const labelStep = axisLabelStep(labels, resolvedGroupWidth);
  const barWidth = Math.max(1.2, Math.min(12, (resolvedGroupWidth * 0.72 - innerGap * (series.length - 1)) / series.length));
  const totalBarsWidth = barWidth * series.length + innerGap * (series.length - 1);
  const formatAxisValue = (value: number) => formatChartAxisValue(value, unit, valueFormatter);

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
        {label ? <p className="text-xs font-bold uppercase tracking-[0.05em] text-[#0F172A]">{label}</p> : <span />}
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
      <div className="overflow-visible">
        <svg
          role="img"
          aria-label={label ?? "Гистограмма"}
          className="block h-auto w-full overflow-visible"
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
                  {formatAxisValue(tick)}
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
            const axisLabelY = top + plotHeight + 6;
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
                {index % labelStep === 0 ? (
                  <text
                    x={centerX}
                    y={axisLabelY}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    className="soft-chart-axis-label fill-[#475569] text-[10px] tabular-nums"
                  >
                    {item.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          <g className="soft-chart-tooltip-layer">
            {buildVerticalTooltipHits().map((hit) => (
              <g key={hit.key} className="soft-chart-hit" tabIndex={0} aria-label={hit.tooltip}>
                <rect
                  x={hit.x - Math.max(3, (plotWidth / data.length - barWidth) / 2)}
                  y={top}
                  width={hit.barHeight > 0 ? Math.max(barWidth + 6, plotWidth / data.length) : 0}
                  height={plotHeight}
                  fill="transparent"
                />
                <g className="soft-chart-tooltip" transform={`translate(${hit.tooltipX} ${hit.tooltipY})`}>
                  <rect x={-hit.tooltipWidth / 2} y="-34" width={hit.tooltipWidth} height="30" rx="7" />
                  <text x="0" y="-15" textAnchor="middle">{hit.tooltip}</text>
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

  const left = 64;
  const right = 14;
  const top = 8;
  const plotHeight = 176;
  const labels = data.map((item) => item.label);
  const width = fixedChartWidth();
  const plotWidth = width - left - right;
  const slotWidth = axisSlotWidth(labels, plotWidth);
  const labelLayout = axisLabelLayout(labels, slotWidth);
  const resolvedSlotWidth = labelLayout.slotWidth;
  const bottom = labelLayout.bottom;
  const height = top + plotHeight + bottom;
  const tickValues = chartTickValues(max, integerTicks);
  const labelStep = axisLabelStep(labels, resolvedSlotWidth);
  const barWidth = Math.max(1.2, Math.min(15, resolvedSlotWidth * 0.58));
  const formatAxisValue = (value: number) => formatChartAxisValue(value, unit, valueFormatter);

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
        {label ? <p className="text-xs font-bold uppercase tracking-[0.05em] text-[#0F172A]">{label}</p> : <span />}
        <div className="flex flex-wrap gap-3 text-[10px] text-[#475569]">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-visible">
        <svg
          role="img"
          aria-label={label ?? "Гистограмма с накоплением"}
          className="block h-auto w-full overflow-visible"
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
                  {formatAxisValue(tick)}
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
                {index % labelStep === 0 ? (
                  <text
                    x={centerX}
                    y={top + plotHeight + 6}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    className="soft-chart-axis-label fill-[#475569] text-[10px] tabular-nums"
                  >
                    {item.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          <g className="soft-chart-tooltip-layer">
            {buildStackedTooltipHits().map((hit) => (
              <g key={hit.key} className="soft-chart-hit" tabIndex={0} aria-label={hit.tooltip}>
                <rect
                  x={hit.x - 4}
                  y={hit.y}
                  width={Math.max(barWidth + 8, plotWidth / data.length)}
                  height={hit.segmentHeight}
                  fill="transparent"
                />
                <g className="soft-chart-tooltip" transform={`translate(${hit.tooltipX} ${hit.tooltipY})`}>
                  <rect x={-hit.tooltipWidth / 2} y="-34" width={hit.tooltipWidth} height="30" rx="7" />
                  <text x="0" y="-15" textAnchor="middle">{hit.tooltip}</text>
                </g>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

export type SmallMultipleChartItem = {
  key: string;
  title: string;
  value?: string;
  data: ChartPoint[];
  unit?: string;
  seriesLabels?: [string, string?, string?];
  valueFormatter?: (value: number) => string;
  integerTicks?: boolean;
};

export function SmallMultiplesBarGrid({
  items,
  empty = "Нет данных за выбранный период",
}: {
  items: SmallMultipleChartItem[];
  empty?: ReactNode;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="admin-small-multiples-grid">
      {items.map((item) => (
        <div key={item.key} className="soft-admin-chart-card min-w-0 rounded-lg border border-[#D6DEE9] bg-white p-2.5 shadow-[0_16px_42px_-36px_rgba(15,23,42,0.5)]">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.04em] text-[#0F172A]" title={item.title}>{item.title}</p>
              {item.value ? <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#2563EB]">{item.value}</p> : null}
            </div>
            {item.seriesLabels ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5 text-[9px] text-[#64748B]">
                {chartSeries(item.data, item.seriesLabels).map((series, index) => (
                  <span key={series.key} className="inline-flex items-center gap-1">
                    <i className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: CHART_KIT_PALETTE[index % CHART_KIT_PALETTE.length] }} />
                    {series.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <MiniBarSparkline
            data={item.data}
            unit={item.unit}
            seriesLabels={item.seriesLabels}
            valueFormatter={item.valueFormatter}
            integerTicks={item.integerTicks}
          />
        </div>
      ))}
    </div>
  );
}

export function MiniBarSparkline({
  data,
  unit,
  seriesLabels,
  valueFormatter,
  integerTicks = false,
}: {
  data: ChartPoint[];
  unit?: string;
  seriesLabels?: [string, string?, string?];
  valueFormatter?: (value: number) => string;
  integerTicks?: boolean;
}) {
  const series = chartSeries(data, seriesLabels);
  const rawMax = Math.max(...data.flatMap((item) => [item.value, item.secondary ?? 0, item.tertiary ?? 0]), 1);
  const max = integerTicks ? Math.max(1, Math.ceil(rawMax)) : rawMax;
  const formatValue = valueFormatter ?? ((value: number) => `${formatNumber(value)}${unit ?? ""}`);
  const formatAxisValue = (value: number) => formatChartAxisValue(value, unit, valueFormatter);
  if (data.length === 0 || !data.some((item) => item.value > 0 || (item.secondary ?? 0) > 0 || (item.tertiary ?? 0) > 0)) {
    return <div className="grid h-28 place-items-center rounded-md bg-[#F8FAFC] text-xs text-[#64748B]">Нет событий</div>;
  }

  const width = 420;
  const height = 126;
  const left = 34;
  const right = 8;
  const top = 8;
  const plotHeight = 86;
  const plotWidth = width - left - right;
  const slotWidth = plotWidth / data.length;
  const innerGap = 1;
  const barWidth = Math.max(1.5, Math.min(7, (slotWidth - 3 - innerGap * (series.length - 1)) / series.length));
  const totalBarsWidth = barWidth * series.length + innerGap * (series.length - 1);
  const tickValues = chartTickValues(max, integerTicks).slice(0, 4);
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];

  function yFor(value: number) {
    return top + plotHeight - (Math.max(0, value) / max) * plotHeight;
  }

  return (
    <svg
      role="img"
      aria-label="Компактная гистограмма"
      className="block h-28 w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      data-testid="admin-mini-bar-sparkline"
      shapeRendering="geometricPrecision"
    >
      {tickValues.map((tick) => {
        const y = yFor(tick);
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke={CHART_KIT_GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={left - 6} y={y + 3} textAnchor="end" className="fill-[#64748B] text-[9px] tabular-nums">
              {formatAxisValue(tick)}
            </text>
          </g>
        );
      })}
      <line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke={CHART_KIT_AXIS} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {data.map((item, index) => {
        const groupX = left + index * slotWidth;
        const centerX = groupX + slotWidth / 2;
        const startX = groupX + (slotWidth - totalBarsWidth) / 2;
        return (
          <g key={`${item.label}-${index}`}>
            {series.map((seriesItem, seriesIndex) => {
              const raw = Number(item[seriesItem.key] ?? 0);
              const barHeight = raw > 0 ? Math.max(1.5, (raw / max) * plotHeight) : 0;
              const x = startX + seriesIndex * (barWidth + innerGap);
              const y = top + plotHeight - barHeight;
              const tooltip = `${item.label} · ${seriesItem.label}: ${formatValue(raw)}`;
              const { width: tooltipWidth } = tooltipSize(tooltip);
              const tooltipX = Math.max(left + tooltipWidth / 2 + 4, Math.min(width - right - tooltipWidth / 2 - 4, centerX));
              const tooltipY = Math.max(top + 34, y - 6);
              return (
                <g key={seriesItem.key} className="soft-chart-hit" tabIndex={0} aria-label={tooltip}>
                  <rect x={x} y={y} width={barWidth} height={barHeight} rx="1.5" fill={seriesItem.color} opacity={raw > 0 ? 0.96 : 0} />
                  <rect x={groupX} y={top} width={slotWidth} height={plotHeight} fill="transparent" />
                  <g className="soft-chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`}>
                    <rect x={-tooltipWidth / 2} y="-34" width={tooltipWidth} height="30" rx="7" />
                    <text x="0" y="-15" textAnchor="middle">{tooltip}</text>
                  </g>
                </g>
              );
            })}
            {labelIndexes.includes(index) ? (
              <text x={centerX} y={top + plotHeight + 8} textAnchor="middle" dominantBaseline="hanging" className="fill-[#64748B] text-[9px] tabular-nums">
                {item.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function HorizontalBars({ data, unit }: { data: ChartPoint[]; unit?: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="soft-admin-chart-card space-y-3 rounded-lg border border-[#D6DEE9] bg-white p-3 shadow-[0_16px_46px_-36px_rgba(15,23,42,0.45)]">
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
    <div className="soft-admin-chart-card rounded-lg border border-[#D6DEE9] bg-white p-3 shadow-[0_16px_46px_-36px_rgba(15,23,42,0.45)]">
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
