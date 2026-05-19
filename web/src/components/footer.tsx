import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-mark";
import { mainUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

export function Footer({ variant = "soft" }: { variant?: "dark" | "soft" }) {
  const soft = variant === "soft";
  const linkCls = cn("hover:text-foreground transition-colors", soft && "hover:text-[var(--soft-bordeaux)]");
  const mutedCls = cn("space-y-1.5 text-muted-foreground", soft && "text-[var(--soft-ink-faint)]");
  const titleCls = cn("mb-2 font-semibold", soft ? "text-[var(--soft-bordeaux)]" : "text-foreground");
  const columns = [
    {
      title: "Бесплатно",
      links: [
        [mainUrl("/checkin"), "Первичный разбор"],
        [mainUrl("/library"), "Библиотека вопросов"],
        [mainUrl("/practice"), "Практика ясности"],
        [mainUrl("/circle"), "Круг ясности"],
        [mainUrl("/pair"), "Разобраться вдвоём"],
      ],
    },
    {
      title: "Психология",
      links: [
        [mainUrl("/products/perspectives"), "4 ракурса"],
        [mainUrl("/products/deep-report"), "Глубокий отчёт"],
        [mainUrl("/products/chat-analysis"), "Разбор переписки"],
        [mainUrl("/products/compatibility"), "Совместимость"],
        [mainUrl("/products/seven-days"), "7 дней к ясности"],
      ],
    },
    {
      title: "Эзотерика",
      links: [
        [mainUrl("/tarot"), "Таро · скоро"],
        [mainUrl("/astro"), "Астрология · скоро"],
        [mainUrl("/numerology"), "Нумерология · скоро"],
        [mainUrl("/products/my-map"), "Расширенная карта"],
      ],
    },
    {
      title: "Социальное и обучение",
      links: [
        [mainUrl("/practitioners"), "Специалисты"],
        [mainUrl("/practitioners/apply"), "Стать специалистом"],
        [mainUrl("/telegram"), "Telegram"],
        [mainUrl("/missions"), "Миссии"],
      ],
    },
    {
      title: "Платформа",
      links: [
        [mainUrl("/products"), "Все форматы"],
        [mainUrl("/pricing"), "Тарифы"],
        [mainUrl("/how-it-works"), "Как работает"],
        [mainUrl("/about"), "О проекте"],
      ],
    },
    {
      title: "Помощь",
      links: [
        [mainUrl("/help"), "Поддержка и FAQ"],
        [mainUrl("/legal/privacy"), "Приватность"],
        [mainUrl("/legal/cookies"), "Cookies"],
        [mainUrl("/legal/disclaimer"), "Дисклеймер"],
        [mainUrl("/legal/ethics"), "Этический кодекс"],
        [mainUrl("/legal/offer"), "Договор-оферта"],
      ],
    },
  ];

  return (
    <footer
      data-testid="public-shell-footer"
      className={cn("border-t border-[var(--soft-paper-edge)]/60 bg-[var(--soft-paper)]", soft && "soft-footer")}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <BrandLogo height={34} theme={soft ? "light" : "dark"} />

          <div className="soft-footer-columns grid flex-1 gap-x-8 gap-y-6 text-sm">
            {columns.map((column) => (
              <div key={column.title}>
                <p className={titleCls}>{column.title}</p>
                <ul className={mutedCls}>
                  {column.links.map(([href, label]) => (
                    <li key={href + label}><Link href={href} className={linkCls}>{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className={cn("mt-6 border-t pt-5 text-xs text-muted-foreground", soft ? "border-[var(--soft-paper-edge)] text-[var(--soft-ink-faint)]" : "border-border/30")}>
          © {new Date().getFullYear()} ETerapy. Все услуги носят ознакомительный характер — не являются медицинской, юридической или финансовой помощью.
        </p>
      </div>
    </footer>
  );
}
