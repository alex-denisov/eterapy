import Link from "next/link";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}

/**
 * Универсальное пустое состояние.
 * Заменяет дублирующиеся паттерны «Нет данных» + CTA.
 */
export function EmptyState({
  icon = "📭",
  title,
  description,
  actionHref,
  actionLabel,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border/30 py-12 text-center text-muted-foreground",
      className
    )}>
      <p className="text-4xl mb-3">{icon}</p>
      <p className="font-medium">{title}</p>
      {description && (
        <p className="mt-1 text-sm">{description}</p>
      )}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
