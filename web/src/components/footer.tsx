import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { BrandLogo } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

export function Footer({ variant = "dark" }: { variant?: "dark" | "soft" }) {
  const soft = variant === "soft";

  return (
    <footer
      data-testid="public-shell-footer"
      className={cn("border-t border-brand-warm-gold/15 bg-navy/96", soft && "soft-footer")}
    >
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <BrandLogo height={38} theme={soft ? "light" : "dark"} />
            <p className={cn("mt-2 text-sm text-muted-foreground", soft && "text-[var(--soft-ink-faint)]")}>
              Диалоговая платформа ясности. Бережно, красиво и без давления.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">Клиентам</h4>
            <ul className={cn("space-y-2 text-sm text-muted-foreground", soft && "text-[var(--soft-ink-faint)]")}>
              <li><Link href="/all-modalities/checkin" className="hover:text-foreground">Задать вопрос</Link></li>
              <li><Link href="/products" className="hover:text-foreground">Продукты</Link></li>
              <li><Link href="/products/deep-report" className="hover:text-foreground">Глубокий отчет</Link></li>
              <li><Link href="/products/chat-analysis" className="hover:text-foreground">Разбор переписки</Link></li>
              <li><Link href="/products/compatibility" className="hover:text-foreground">Совместимость</Link></li>
              <li><Link href="/products/seven-days" className="hover:text-foreground">7 дней к ясности</Link></li>
              <li><Link href="/library" className="hover:text-foreground">Библиотека вопросов</Link></li>
              <li><Link href="/pricing" className="hover:text-foreground">Цены и тарифы</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">Практикам</h4>
            <ul className={cn("space-y-2 text-sm text-muted-foreground", soft && "text-[var(--soft-ink-faint)]")}>
              <li><Link href="/practitioners/apply" className="hover:text-foreground">Стать практиком</Link></li>
              <li><Link href="/practitioner" className="hover:text-foreground">Кабинет практика</Link></li>
              <li><Link href="/about#commission" className="hover:text-foreground">Условия и комиссия</Link></li>
              <li><Link href="/legal/ethics" className="hover:text-foreground">Этический кодекс</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">О проекте</h4>
            <ul className={cn("space-y-2 text-sm text-muted-foreground", soft && "text-[var(--soft-ink-faint)]")}>
              <li><Link href="/about" className="hover:text-foreground">О нас</Link></li>
              <li><Link href="/help" className="hover:text-foreground">Поддержка и жалобы</Link></li>
              <li><Link href="/#faq" className="hover:text-foreground">FAQ</Link></li>
              <li><Link href="/legal/privacy" className="hover:text-foreground">Политика конфиденциальности</Link></li>
              <li><Link href="/legal/offer" className="hover:text-foreground">Оферта</Link></li>
            </ul>
          </div>
        </div>

        <Separator className={cn("my-8 bg-border/40", soft && "bg-[var(--soft-paper-edge)]")} />

        <div className={cn("flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground md:flex-row", soft && "text-[var(--soft-ink-faint)]")}>
          <p>© {new Date().getFullYear()} ETerapy. Все права защищены.</p>
          <p className="max-w-xl text-center md:text-right">
            Все услуги носят развлекательный и ознакомительный характер. ETerapy не является
            медицинской, юридической или финансовой организацией.
          </p>
        </div>
      </div>
    </footer>
  );
}
