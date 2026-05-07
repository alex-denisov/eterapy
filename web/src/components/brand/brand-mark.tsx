import { cn } from "@/lib/utils";

type BrandTheme = "dark" | "light";

/**
 * ETerapy Design v4 halo. The legacy dark Brandbook mark is intentionally not
 * represented here: every surface uses this scalable SVG lockup.
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
  return <SoftHaloMark size={size} className={className} glow={glow} title={title} />;
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
export function SoftHaloMark({
  size = 38,
  className,
  glow = true,
  title,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  title?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: `radial-gradient(circle at 35% 35%, #FFF, transparent 38%),
          conic-gradient(from 30deg, #F4C9A8, #E8B8D1, #D9C9E8, #F4C9A8)`,
        boxShadow: glow
          ? "0 0 0 1px rgba(60,30,20,.06), 0 4px 14px -4px rgba(214,117,88,.4)"
          : "0 0 0 1px rgba(60,30,20,.06)",
      }}
    />
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
        theme === "light" ? "text-[var(--soft-bordeaux,#5c2a2c)]" : "text-foreground",
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
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <SoftHaloMark size={height} glow={!compact} title={compact ? "" : "ETerapy"} />
      <span className="inline-flex min-w-0 flex-col">
        <Wordmark theme={theme} fontSize={Math.max(21, height * 0.58)} />
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
  return (
    <span className={cn("inline-flex items-center gap-3", className)} style={{ height }}>
      <SoftHaloMark size={height} glow={false} title="ETerapy" />
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
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SoftHaloMark size={compact ? 30 : 38} glow={!compact} title="ETerapy" />
      <div className="min-w-0">
        <div
          className="font-heading text-xl font-medium leading-none tracking-normal"
          style={{ color: theme === "light" ? "var(--soft-bordeaux, #5c2a2c)" : undefined }}
        >
          ETerapy
        </div>
      </div>
    </div>
  );
}
