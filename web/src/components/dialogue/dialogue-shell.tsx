import { cn } from "@/lib/utils";

interface DialogueShellProps {
  title: string;
  kicker?: string;
  description?: React.ReactNode;
  progress?: { current: number; total: number };
  children: React.ReactNode;
  className?: string;
}

export function DialogueShell({
  title,
  kicker = "Диалог",
  description,
  progress,
  children,
  className,
}: DialogueShellProps) {
  const progressValue = progress
    ? Math.min(100, Math.max(0, Math.round((progress.current / progress.total) * 100)))
    : null;

  return (
    <section
      data-testid="dialogue-shell"
      className={cn("relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 md:py-14", className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-8 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--dialogue-halo-core)_20%,transparent),transparent_68%)] blur-2xl"
      />
      <div className="relative mx-auto w-full max-w-2xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-soft-gold">{kicker}</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
          {description && <div className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{description}</div>}
          {progress && (
            <div className="mt-6" aria-label={`Шаг ${progress.current} из ${progress.total}`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--dialogue-halo-warm),var(--dialogue-halo-cool))] transition-all duration-[var(--motion-slow)]"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            </div>
          )}
        </header>
        {children}
      </div>
    </section>
  );
}
