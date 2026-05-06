import { useId } from "react";
import { cn } from "@/lib/utils";

type BrandTheme = "dark" | "light";

/**
 * Dialogue Halo — pure SVG, recolorable, no PNG dependency.
 * Two arcs (gold and lavender) framing a warm core glow. Used as the
 * universal mark across the platform.
 */
export function HaloSymbol({
  size = 56,
  className,
  glow = true,
  title = "ETerapy Dialogue Halo",
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  title?: string;
}) {
  const rawId = useId().replace(/:/g, "");
  const coreId = `haloCore-${rawId}`;
  const goldArcId = `haloGoldArc-${rawId}`;
  const lavenderArcId = `haloLavenderArc-${rawId}`;
  const depthId = `haloArcDepth-${rawId}`;

  return (
    <span
      aria-hidden={title ? undefined : true}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <span className="absolute inset-[19%] rounded-full bg-brand-glow/30 blur-2xl" aria-hidden="true" />
      )}
      <svg
        role={title ? "img" : undefined}
        aria-label={title || undefined}
        viewBox="0 0 120 120"
        className="relative h-full w-full overflow-visible"
        fill="none"
      >
        <defs>
          <radialGradient id={coreId} cx="50%" cy="52%" r="42%">
            <stop offset="0%" stopColor="var(--brand-glow-center)" stopOpacity="0.98" />
            <stop offset="34%" stopColor="var(--brand-soft-gold)" stopOpacity="0.42" />
            <stop offset="72%" stopColor="var(--brand-lavender)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={goldArcId} x1="21" x2="72" y1="99" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C4883D" />
            <stop offset="45%" stopColor="var(--brand-soft-gold)" />
            <stop offset="100%" stopColor="#FFE0A5" />
          </linearGradient>
          <linearGradient id={lavenderArcId} x1="66" x2="102" y1="17" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--brand-lavender-light)" />
            <stop offset="50%" stopColor="var(--brand-lavender)" />
            <stop offset="100%" stopColor="#6F68C9" />
          </linearGradient>
          <filter id={depthId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#020712" floodOpacity="0.48" />
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#FFD79A" floodOpacity="0.18" />
          </filter>
        </defs>
        <circle cx="60" cy="62" r="30" fill={`url(#${coreId})`} />
        <circle cx="60" cy="62" r="17" fill="var(--brand-glow-center)" opacity="0.36" />
        <path
          d="M59.5 18.5C37.2 23.9 22.2 43 22.2 64.9c0 15.8 7.8 29.5 20.1 37.6"
          stroke={`url(#${goldArcId})`}
          strokeWidth="17"
          strokeLinecap="round"
          filter={`url(#${depthId})`}
        />
        <path
          d="M74.2 19.1c14.9 5.3 25.6 19.8 25.6 37.1 0 20-12 36.9-28.5 44.2"
          stroke={`url(#${lavenderArcId})`}
          strokeWidth="17"
          strokeLinecap="round"
          filter={`url(#${depthId})`}
        />
        <path
          d="M42.4 29.5c-7.9 6.1-13.1 15.2-14.8 25.1"
          stroke="#fff2cf"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.34"
        />
        <path
          d="M81.7 28.2c6 4.2 10.2 10.2 12.1 17"
          stroke="#efeaff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.34"
        />
      </svg>
    </span>
  );
}

/**
 * Compact halo-only mark. Same SVG as HaloSymbol; provided as a separate
 * export so consumers can be explicit about intent (icon vs symbol).
 */
export function HaloMark({
  size = 56,
  className,
  glow = true,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  /** @deprecated kept for prop compatibility; no-op since the mark is SVG, not an Image */
  priority?: boolean;
}) {
  return <HaloSymbol size={size} className={className} glow={glow} title="" />;
}

/**
 * Soft Clarity brand mark — CSS gradient circle matching docs/Design/v4.
 * Used when the surface is light (cream/paper), where the Aurora SVG halo
 * looks off due to its dark-background drop shadows.
 */
export function SoftHaloMark({ size = 38 }: { size?: number }) {
  const rawId = useId().replace(/:/g, "");
  const coreId = `softHaloCore-${rawId}`;
  const goldId = `softHaloGold-${rawId}`;
  const lilacId = `softHaloLilac-${rawId}`;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
      }}
    >
      <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible" fill="none">
        <defs>
          <radialGradient id={coreId} cx="50%" cy="52%" r="42%">
            <stop offset="0%" stopColor="var(--brand-glow-center, #ffd79a)" stopOpacity="0.95" />
            <stop offset="38%" stopColor="var(--soft-halo-1, #f4c9a8)" stopOpacity="0.42" />
            <stop offset="78%" stopColor="var(--soft-halo-3, #d9c9e8)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={goldId} x1="21" x2="72" y1="99" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--soft-terracotta-dark, #b85b40)" />
            <stop offset="45%" stopColor="var(--brand-soft-gold, #f2c37d)" />
            <stop offset="100%" stopColor="#ffe0a5" />
          </linearGradient>
          <linearGradient id={lilacId} x1="66" x2="102" y1="17" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--soft-lilac-soft, #dbd3ea)" />
            <stop offset="50%" stopColor="var(--soft-lilac, #a89bc9)" />
            <stop offset="100%" stopColor="var(--brand-lavender, #8e89d6)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="62" r="30" fill={`url(#${coreId})`} />
        <circle cx="60" cy="62" r="15" fill="var(--brand-glow-center, #ffd79a)" opacity="0.3" />
        <path
          d="M59.5 18.5C37.2 23.9 22.2 43 22.2 64.9c0 15.8 7.8 29.5 20.1 37.6"
          stroke={`url(#${goldId})`}
          strokeWidth="17"
          strokeLinecap="round"
        />
        <path
          d="M74.2 19.1c14.9 5.3 25.6 19.8 25.6 37.1 0 20-12 36.9-28.5 44.2"
          stroke={`url(#${lilacId})`}
          strokeWidth="17"
          strokeLinecap="round"
        />
        <path d="M42.4 29.5c-7.9 6.1-13.1 15.2-14.8 25.1" stroke="#fff7df" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
        <path d="M81.7 28.2c6 4.2 10.2 10.2 12.1 17" stroke="#f6f0ff" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      </svg>
    </span>
  );
}

/**
 * Word-only mark — "ETerapy" set in Fraunces (display heading).
 */
function Wordmark({
  fontSize,
  className,
  theme = "dark",
}: {
  fontSize: number;
  className?: string;
  theme?: BrandTheme;
}) {
  return (
    <span
      className={cn(
        "font-heading font-semibold leading-none tracking-normal",
        theme === "light" ? "text-brand-midnight" : "text-foreground",
        className,
      )}
      style={{ fontSize }}
    >
      ETerapy
    </span>
  );
}

/**
 * Halo + wordmark. Used in the public header.
 */
export function VectorBrandLogo({
  theme = "dark",
  height = 38,
  className,
  compact = false,
}: {
  theme?: BrandTheme;
  height?: number;
  className?: string;
  compact?: boolean;
}) {
  const mark =
    theme === "light" ? (
      <SoftHaloMark size={height} />
    ) : (
      <HaloSymbol size={height} glow={!compact} />
    );
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark}
      <span className="inline-flex min-w-0 flex-col">
        <Wordmark theme={theme} fontSize={Math.max(21, height * 0.58)} />
        {!compact && theme === "dark" && (
          <span className="mt-1 hidden text-[0.42rem] font-bold uppercase leading-none tracking-[0.22em] text-brand-soft-gold sm:inline">
            Ясность · Диалог · Понимание
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Halo + wordmark. Used in the footer. Sets a slightly larger gap and
 * accepts the same `theme` / `height` interface as the legacy Image-backed
 * BrandLogo so existing call sites keep working — but renders as pure SVG
 * code, no PNG.
 */
export function BrandLogo({
  theme = "dark",
  height = 38,
  className,
}: {
  theme?: BrandTheme;
  height?: number;
  className?: string;
  /** @deprecated kept for prop compatibility; no-op since the logo is SVG, not an Image */
  priority?: boolean;
}) {
  const mark =
    theme === "light" ? (
      <SoftHaloMark size={height} />
    ) : (
      <HaloSymbol size={height} glow={false} />
    );
  return (
    <span className={cn("inline-flex items-center gap-3", className)} style={{ height }}>
      {mark}
      <Wordmark theme={theme} fontSize={Math.max(20, height * 0.62)} />
    </span>
  );
}

/**
 * Compact lockup — halo + wordmark + optional tagline.
 * Used inside the dialogue/cabinet/admin shells where the brand needs to be
 * present but quiet.
 */
export function BrandSignature({
  compact = false,
  className,
  theme = "dark",
}: {
  compact?: boolean;
  className?: string;
  theme?: BrandTheme;
}) {
  const mark =
    theme === "light" ? (
      <SoftHaloMark size={compact ? 30 : 38} />
    ) : (
      <HaloSymbol size={compact ? 30 : 38} glow={!compact} />
    );
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {mark}
      <div className="min-w-0">
        <div
          className="font-heading text-xl font-medium leading-none tracking-normal"
          style={{ color: theme === "light" ? "var(--soft-bordeaux, #5c2a2c)" : undefined }}
        >
          ETerapy
        </div>
        {!compact && theme === "dark" && (
          <div className="mt-1 text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-brand-soft-gold">
            Ясность · Диалог · Понимание
          </div>
        )}
      </div>
    </div>
  );
}
