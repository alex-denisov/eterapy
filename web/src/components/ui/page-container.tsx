import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Максимальная ширина. По умолчанию `max-w-3xl`. */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "full";
}

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-none",
};

/**
 * Универсальный контейнер страницы.
 * Заменяет разрозненные `px-6 py-8 max-w-*` в cabinet/admin.
 */
export function PageContainer({
  children,
  className,
  maxWidth = "3xl",
}: PageContainerProps) {
  return (
    <div
      className={cn("premium-page mx-auto px-4 py-8 sm:px-6", MAX_WIDTH_MAP[maxWidth], className)}
    >
      {children}
    </div>
  );
}
