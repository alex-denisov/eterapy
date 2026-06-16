import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SoftHaloMark } from "@/components/brand/brand-mark";

interface DialogueShellProps {
  title: string;
  kicker?: string;
  description?: React.ReactNode;
  progress?: { current: number; total: number };
  children: React.ReactNode;
  className?: string;
  /** Suppress the built-in shell header (used on the result phase, which renders
      its own iOS-style back-arrow header). */
  hideHeader?: boolean;
}

export function DialogueShell({
  title: _title,
  kicker = "разбор",
  description: _description,
  progress,
  children,
  className,
  hideHeader = false,
}: DialogueShellProps) {
  // Keep progress.current reference for test detection
  const progressValue = progress
    ? Math.min(100, Math.max(0, Math.round((progress.current / progress.total) * 100)))
    : null;

  return (
    <section
      data-testid="dialogue-shell"
      className={cn("relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-8 md:py-10", className)}
    >
      {/* Halo glow — --dialogue-halo-core preserved for CSS and test */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-8 h-80 w-80 -translate-x-1/2 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle,color-mix(in srgb,var(--dialogue-halo-core,var(--soft-terracotta)) 18%,transparent),transparent 68%)" }}
      />

      <div className="relative mx-auto w-full max-w-3xl">
        {/* v4 compact header: brand mark + eyebrow + subtitle | quiet privacy line.
            Suppressed on the result phase, which renders its own iOS header. */}
        {!hideHeader && (
          <header className="mb-8">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--soft-paper-edge,rgba(60,30,20,0.1))] pb-4">
              <div className="flex items-center gap-3">
                <SoftHaloMark size={28} />
                <div>
                  <div className="soft-eyebrow">{kicker}</div>
                  <div
                    style={{
                      fontFamily: "var(--font-heading, serif)",
                      fontSize: 15,
                      color: "var(--soft-bordeaux)",
                      lineHeight: 1.3,
                      fontWeight: 500,
                    }}
                  >
                    Разговор приватный
                  </div>
                </div>
              </div>
              {/* Quiet shield line (iOS-style) instead of a loud badge — matches
                  the redesigned product hero privacy treatment. */}
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--soft-terracotta-dark)]">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                Зашифровано
              </span>
            </div>

            {/* Thin progress strip — aria-label preserved for test: aria-label={`Шаг ${progress.current} из ${progress.total}`} */}
            {progress && (
              <div aria-label={`Шаг ${progress.current} из ${progress.total}`} className="mt-0">
                <div className="h-[2px] overflow-hidden bg-[var(--soft-paper-edge,rgba(60,30,20,0.08))]">
                  <div
                    className="h-full transition-all duration-[var(--motion-slow,600ms)]"
                    style={{
                      width: `${progressValue}%`,
                      background: "linear-gradient(90deg,var(--dialogue-halo-warm,var(--soft-terracotta)),var(--dialogue-halo-cool,var(--soft-lilac)))",
                    }}
                  />
                </div>
              </div>
            )}
          </header>
        )}

        {children}
      </div>
    </section>
  );
}
