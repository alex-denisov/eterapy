import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-mark";
import { mainUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

export function Footer({ variant = "soft" }: { variant?: "dark" | "soft" }) {
  const soft = variant === "soft";
  const linkCls = cn("hover:text-foreground transition-colors", soft && "hover:text-[var(--soft-bordeaux)]");
  const mutedCls = cn("space-y-1.5 text-muted-foreground", soft && "text-[var(--soft-ink-faint)]");
  const titleCls = cn("mb-2 font-semibold", soft ? "text-[var(--soft-bordeaux)]" : "text-foreground");

  return (
    <footer
      data-testid="public-shell-footer"
      className={cn("border-t border-[var(--soft-paper-edge)]/60 bg-[var(--soft-paper)]", soft && "soft-footer")}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <BrandLogo height={34} theme={soft ? "light" : "dark"} />

          <div className="grid gap-x-10 gap-y-5 text-sm sm:grid-cols-3">
            <div>
              <p className={titleCls}>Продукты</p>
              <ul className={mutedCls}>
                <li><Link href={mainUrl("/products")} className={linkCls}>Все форматы</Link></li>
                <li><Link href={mainUrl("/checkin")} className={linkCls}>Диалог ясности</Link></li>
                <li><Link href={mainUrl("/products/perspectives")} className={linkCls}>4 ракурса</Link></li>
                <li><Link href={mainUrl("/products/chat-analysis")} className={linkCls}>Разбор переписки</Link></li>
                <li><Link href={mainUrl("/products/seven-days")} className={linkCls}>7 дней к ясности</Link></li>
                <li><Link href={mainUrl("/circle")} className={linkCls}>Круг ясности</Link></li>
                <li><Link href={mainUrl("/pair")} className={linkCls}>Разобраться вдвоём</Link></li>
                <li><Link href={mainUrl("/missions")} className={linkCls}>Практика ясности</Link></li>
                <li><Link href={mainUrl("/telegram")} className={linkCls}>В Telegram</Link></li>
                <li><Link href={mainUrl("/pricing")} className={linkCls}>Тарифы</Link></li>
              </ul>
            </div>

            <div>
              <p className={titleCls}>Направления</p>
              <ul className={mutedCls}>
                <li><Link href={mainUrl("/practitioners")} className={linkCls}>Психология и коучинг</Link></li>
                <li><Link href={mainUrl("/tarot")} className={linkCls}>Таро · скоро</Link></li>
                <li><Link href={mainUrl("/astro")} className={linkCls}>Астрология · скоро</Link></li>
                <li><Link href={mainUrl("/numerology")} className={linkCls}>Нумерология · скоро</Link></li>
                <li><Link href={mainUrl("/practitioners")} className={linkCls}>Совместная сессия · пилот</Link></li>
                <li><Link href={mainUrl("/products/my-map")} className={linkCls}>Моя карта</Link></li>
                <li><Link href={mainUrl("/library")} className={linkCls}>Библиотека вопросов</Link></li>
              </ul>
            </div>

            <div>
              <p className={titleCls}>Помощь</p>
              <ul className={mutedCls}>
                <li><Link href={mainUrl("/help")} className={linkCls}>Поддержка и FAQ</Link></li>
                <li><Link href={mainUrl("/legal/privacy")} className={linkCls}>Приватность</Link></li>
                <li><Link href={mainUrl("/legal/ethics")} className={linkCls}>Этический кодекс</Link></li>
                <li><Link href={mainUrl("/legal/offer")} className={linkCls}>Договор-оферта</Link></li>
                <li><Link href={mainUrl("/practitioners/apply")} className={linkCls}>Стать специалистом</Link></li>
                <li><Link href={mainUrl("/about")} className={linkCls}>О проекте</Link></li>
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
