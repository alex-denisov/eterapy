import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

type Tone = "ok" | "warn" | "danger" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  ok: "text-emerald-700",
  warn: "text-[var(--soft-terracotta-dark)]",
  danger: "text-red-700",
  neutral: "text-[var(--soft-bordeaux)]",
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
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.05em] text-[var(--soft-ink-soft)]">
        <Icon className="h-4 w-4 text-[var(--soft-bordeaux)]" />
        {label}
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${TONE_CLASS[tone]}`}>{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{hint}</p>
    </div>
  );
}

export function AdminOpsSection({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
      <div className="flex flex-col gap-2 border-b border-[var(--soft-paper-edge)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-[var(--soft-ink)]">{title}</h2>
        {actionHref && actionLabel && (
          <Link className="soft-admin-action w-fit" href={actionHref}>
            {actionLabel}
          </Link>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
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
