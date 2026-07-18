import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { AnalyticsSection, MetricCard, type MetricTone } from "../admin-analytics-ui";

type Tone = "ok" | "warn" | "danger" | "neutral";

const TONE_MAP: Record<Tone, MetricTone> = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  neutral: "neutral",
};

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
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

export function AdminOpsMetric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
  /** B543: якорь на блок с детализацией (`#services`) или ссылка на подраздел. */
  href?: string;
}) {
  return <MetricCard icon={<Icon className="h-3.5 w-3.5" aria-hidden="true" />} label={label} value={value} hint={hint} tone={TONE_MAP[tone]} href={href} />;
}

export function AdminOpsSection({
  id,
  title,
  actionHref,
  actionLabel,
  children,
}: {
  /** B543: цель для якорной ссылки с карточки-метрики. */
  id?: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return <AnalyticsSection id={id} title={title} actionHref={actionHref} actionLabel={actionLabel}>{children}</AnalyticsSection>;
}

export function AdminOpsLinkCard({
  href,
  title,
  value,
  hint,
}: {
  href: string;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 transition-colors hover:border-[var(--soft-bordeaux)]"
    >
      <p className="text-sm font-semibold text-[var(--soft-ink)]">{title}</p>
      <p className="mt-2 text-xl font-semibold text-[var(--soft-bordeaux)] tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{hint}</p>
    </Link>
  );
}
