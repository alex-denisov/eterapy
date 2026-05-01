import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HaloMark } from "@/components/brand/brand-mark";

export function PremiumPage({
  children,
  className,
  ...props
}: ComponentProps<"main">) {
  return (
    <main className={cn("premium-page", className)} {...props}>
      {children}
    </main>
  );
}

export function PremiumHero({
  eyebrow,
  title,
  lead,
  children,
  visual,
  centered = false,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  visual?: ReactNode;
  centered?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("premium-container py-10 md:py-16", className)}>
      <div className={cn(
        "premium-shell halo-waterline relative overflow-hidden px-5 py-8 md:px-10 md:py-12",
        centered ? "text-center" : "grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center",
      )}>
        <div className="pointer-events-none absolute inset-x-[10%] bottom-0 h-px bg-gradient-to-r from-transparent via-brand-soft-gold/45 to-transparent" />
        <div className={cn(centered && "mx-auto max-w-4xl")}>
          {eyebrow && <div className="premium-eyebrow">{eyebrow}</div>}
          <h1 className="premium-title mt-4 text-4xl md:text-6xl lg:text-7xl">
            {title}
          </h1>
          {lead && <div className="premium-lead mt-5 max-w-3xl">{lead}</div>}
          {children && <div className="mt-8">{children}</div>}
        </div>
        {visual && !centered ? (
          <div className="relative">{visual}</div>
        ) : null}
      </div>
    </section>
  );
}

export function PremiumSection({
  eyebrow,
  title,
  lead,
  children,
  className,
  ...props
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"section">, "title">) {
  return (
    <section className={cn("premium-container py-10 md:py-14", className)} {...props}>
      {(eyebrow || title || lead) && (
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-3xl">
            {eyebrow && <div className="premium-eyebrow">{eyebrow}</div>}
            {title && <h2 className="premium-title mt-3 text-3xl md:text-5xl">{title}</h2>}
          </div>
          {lead && <div className="max-w-sm text-sm leading-relaxed text-muted-foreground">{lead}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type PremiumCardVariant =
  | "elevated"
  | "glow-gold"
  | "glow-lavender"
  | "inset"
  | "stroke-soft";

const PREMIUM_VARIANT_CLASS: Record<PremiumCardVariant, string> = {
  elevated: "surface-elevated",
  "glow-gold": "surface-glow-gold",
  "glow-lavender": "surface-glow-lavender",
  inset: "surface-inset",
  "stroke-soft": "surface-stroke-soft",
};

const PREMIUM_TONE_TO_VARIANT: Record<"default" | "gold" | "lavender", PremiumCardVariant> = {
  default: "elevated",
  gold: "glow-gold",
  lavender: "glow-lavender",
};

/**
 * PremiumCard — router over the four surface primitives defined in
 * docs/agents/07-design-system.md §6. Pick a `variant` that signals
 * MEANING:
 *   - `elevated` (default) — neutral content card
 *   - `glow-gold` — featured / paid / primary call-to-action
 *   - `glow-lavender` — dialogue / depth / AI surface
 *   - `inset` — stat / quote / framed copy
 *   - `stroke-soft` — data tables only
 *
 * The legacy `tone` prop is preserved for backward compatibility. Use
 * `variant` for new code.
 */
export function PremiumCard({
  children,
  variant,
  tone = "default",
  className,
}: {
  children: ReactNode;
  variant?: PremiumCardVariant;
  /** @deprecated use `variant` instead */
  tone?: "default" | "gold" | "lavender";
  className?: string;
}) {
  const resolvedVariant: PremiumCardVariant = variant ?? PREMIUM_TONE_TO_VARIANT[tone];
  return (
    <div className={cn(PREMIUM_VARIANT_CLASS[resolvedVariant], "p-5", className)}>
      {children}
    </div>
  );
}

export function ScenarioCard({
  label,
  title,
  text,
  tone = "gold",
}: {
  label: string;
  title: string;
  text: string;
  tone?: "gold" | "lavender";
}) {
  const variant: PremiumCardVariant = tone === "gold" ? "glow-gold" : "glow-lavender";
  return (
    <PremiumCard variant={variant} className="group relative min-h-44 overflow-hidden transition-transform duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:-translate-y-1">
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand-glow/10 blur-2xl transition-opacity group-hover:opacity-80" />
      <div className={cn("premium-chip", tone === "gold" ? "premium-chip-gold" : "premium-chip-lavender")}>
        {label}
      </div>
      <h3 className="mt-5 font-heading text-2xl font-medium leading-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </PremiumCard>
  );
}

export function HaloVisual({
  label = "Dialogue Halo",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative mx-auto flex aspect-square max-w-[320px] items-center justify-center", className)}>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,215,154,0.18),transparent_62%)]" />
      <div className="absolute inset-[14%] rounded-full border border-brand-soft-gold/10" />
      <div className="absolute inset-[26%] rounded-full border border-brand-lavender/10" />
      <HaloMark size={220} priority />
      <span className="sr-only">{label}</span>
    </div>
  );
}
