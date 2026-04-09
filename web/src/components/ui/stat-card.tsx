import Link from "next/link";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}

/**
 * Универсальная карточка статистики.
 * Заменяет дублирующиеся паттерны в cabinet, admin, practitioner overview.
 */
export function StatCard({
  label,
  value,
  subtext,
  actionHref,
  actionLabel,
  className,
}: StatCardProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border/40 bg-card/50 p-5",
      className
    )}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold font-heading">{value}</p>
      {subtext && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>
      )}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
