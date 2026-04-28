import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type DisclaimerTone = "info" | "safety" | "warning";

interface DisclaimerProps extends React.ComponentProps<"div"> {
  tone?: DisclaimerTone;
  title?: string;
}

const toneClasses: Record<DisclaimerTone, string> = {
  info: "border-brand-lavender/25 bg-brand-lavender/10 text-brand-lavender-light",
  safety: "border-brand-warm-gold/30 bg-brand-warm-gold/10 text-brand-soft-gold",
  warning: "border-destructive/25 bg-destructive/10 text-destructive",
};

const toneIcons = {
  info: Info,
  safety: ShieldCheck,
  warning: AlertTriangle,
};

export function Disclaimer({
  tone = "safety",
  title = "Важно",
  className,
  children,
  ...props
}: DisclaimerProps) {
  const Icon = toneIcons[tone];

  return (
    <div
      data-slot="disclaimer"
      data-tone={tone}
      className={cn(
        "flex gap-3 rounded-[var(--radius-card)] border p-3 text-sm leading-relaxed",
        toneClasses[tone],
        className
      )}
      role={tone === "warning" ? "alert" : "note"}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-medium text-foreground">{title}</p>}
        <div className={cn(title && "mt-1", "text-muted-foreground")}>{children}</div>
      </div>
    </div>
  );
}
