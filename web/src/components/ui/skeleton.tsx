import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/70",
        className
      )}
      {...props}
    />
  );
}

/** Скелет-карточка для списка записей/элементов */
function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border/20 bg-card/20 p-4 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      {lines >= 2 && <Skeleton className="h-3 w-1/2" />}
      {lines >= 3 && <Skeleton className="h-3 w-2/3" />}
    </div>
  );
}

/** Скелет-строка для таблицы */
function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

/** Скелет-статистика (карточка с цифрой) */
function SkeletonStat() {
  return (
    <div className="rounded-xl border border-border/20 bg-card/20 p-4 space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-12" />
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonTableRow, SkeletonStat };
