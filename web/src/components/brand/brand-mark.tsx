import Image from "next/image";
import { brandAssets } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

type BrandTheme = "dark" | "light";

export function HaloMark({
  size = 56,
  className,
  glow = true,
  priority = false,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  priority?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <span className="absolute inset-[16%] rounded-full bg-brand-glow/25 blur-xl" />
      )}
      <Image
        src={brandAssets.icons.appDarkTransparentMaster}
        alt=""
        width={size}
        height={size}
        priority={priority}
        className="relative h-full w-full object-contain"
      />
    </span>
  );
}

export function BrandLogo({
  theme = "dark",
  height = 38,
  className,
  priority = false,
}: {
  theme?: BrandTheme;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const src = theme === "light"
    ? brandAssets.logos.horizontalLight
    : brandAssets.logos.horizontalDark;

  return (
    <Image
      src={src}
      alt="ETerapy"
      width={2048}
      height={682}
      priority={priority}
      className={cn("w-auto object-contain", className)}
      style={{ height }}
    />
  );
}

export function BrandSignature({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <HaloMark size={compact ? 30 : 38} glow={!compact} />
      <div className="min-w-0">
        <div className="font-heading text-xl font-medium leading-none tracking-normal text-foreground">
          ETerapy
        </div>
        {!compact && (
          <div className="mt-1 text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-brand-soft-gold">
            Ясность · Диалог · Понимание
          </div>
        )}
      </div>
    </div>
  );
}
