import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-mark";
import { mainUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

export function Footer({ variant = "dark" }: { variant?: "dark" | "soft" }) {
  const soft = variant === "soft";
  const linkCls = cn("hover:text-foreground transition-colors", soft && "hover:text-[var(--soft-bordeaux)]");

  return (
    <footer
      data-testid="public-shell-footer"
      className={cn("border-t border-brand-warm-gold/15 bg-navy/96", soft && "soft-footer")}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <BrandLogo height={34} theme={soft ? "light" : "dark"} />

          <div className="flex flex-wrap gap-x-10 gap-y-5 text-sm">
            <div>
              <p className={cn("mb-2 font-semibold", soft ? "text-[var(--soft-bordeaux)]" : "text-foreground")}>Клиентам</p>
              <ul className={cn("space-y-1.5 text-muted-foreground", soft && "text-[var(--soft-ink-faint)]")}>
                <li><Link href={mainUrl("/checkin")} className={linkCls}>Диалог ясности</Link></li>
                <li><Link href={mainUrl("/products")} className={linkCls}>Продукты</Link></li>
                <li><Link href={mainUrl("/library")} className={linkCls}>Библиотека</Link></li>
                <li><Link href={mainUrl("/pricing")} className={linkCls}>Тарифы</Link></li>
              </ul>
            </div>

            <div>
              <p className={cn("mb-2 font-semibold", soft ? "text-[var(--soft-bordeaux)]" : "text-foreground")}>Специалистам</p>
              <ul className={cn("space-y-1.5 text-muted-foreground", soft && "text-[var(--soft-ink-faint)]")}>
                <li><Link href={mainUrl("/practitioners/apply")} className={linkCls}>Стать специалистом</Link></li>
                <li><Link href={mainUrl("/legal/ethics")} className={linkCls}>Этический кодекс</Link></li>
              </ul>
            </div>

            <div>
              <p className={cn("mb-2 font-semibold", soft ? "text-[var(--soft-bordeaux)]" : "text-foreground")}>О проекте</p>
              <ul className={cn("space-y-1.5 text-muted-foreground", soft && "text-[var(--soft-ink-faint)]")}>
                <li><Link href={mainUrl("/about")} className={linkCls}>О нас</Link></li>
                <li><Link href={mainUrl("/help")} className={linkCls}>Поддержка</Link></li>
                <li><Link href={mainUrl("/legal/privacy")} className={linkCls}>Конфиденциальность</Link></li>
                <li><Link href={mainUrl("/legal/offer")} className={linkCls}>Оферта</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <p className={cn("mt-6 border-t pt-5 text-xs text-muted-foreground", soft ? "border-[var(--soft-paper-edge)] text-[var(--soft-ink-faint)]" : "border-border/30")}>
          © {new Date().getFullYear()} ETerapy. Все услуги носят ознакомительный характер — не являются медицинской, юридической или финансовой помощью.
        </p>
      </div>
    </footer>
  );
}
