import { cn } from "@/lib/utils";
import { BrandSignature, SoftHaloMark } from "@/components/brand/brand-mark";

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
      className={cn("premium-page relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-8 md:py-12", className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-8 h-80 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--dialogue-halo-core)_24%,transparent),transparent_68%)] blur-2xl"
      />
      <div className="relative mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--soft-paper-edge,rgba(60,30,20,0.1))] pb-4">
            <BrandSignature compact theme="light" />
            <SoftHaloMark size={32} />
          </div>
          <p className="premium-eyebrow">{kicker}</p>
          <h1 className="premium-title mt-2 text-3xl md:text-5xl">{title}</h1>
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
