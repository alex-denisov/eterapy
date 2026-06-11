import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-mark";
import { mainUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

export function Footer({ variant = "soft" }: { variant?: "dark" | "soft" }) {
  const soft = variant === "soft";
  const linkCls = cn("hover:text-foreground transition-colors", soft && "hover:text-[var(--soft-bordeaux)]");
  const mutedCls = cn("space-y-1.5 text-muted-foreground", soft && "text-[var(--soft-ink-faint)]");
  const titleCls = cn("mb-2 font-semibold", soft ? "text-[var(--soft-bordeaux)]" : "text-foreground");
  // T12: footer columns are grouped by product FAMILY, not by price. Earlier the
  // "Бесплатно / Платные разборы / Эзотерика" split was misleading — several
  // products (круг, пара, совместимость, 7 дней) start free but have a paid part,
  // so calling them "Бесплатно" was wrong, and the price-based labels mixed
  // unrelated themes. The footer is navigation, not a price list (G2): prices
  // live on each product page, so labels carry no "₽". Where a free entry exists
  // it is communicated in the product's own copy, not implied by a footer column.
  // T8: footer condensed from 7 → 5 columns so the whole row fits on one line
  // (the 7-column layout pushed "Помощь" onto a second row). The four product
  // families are merged into two thematic columns by meaning: solo AI analyses
  // ("Разборы"), shared + habit formats ("Вместе и практика"), and the symbolic
  // + human track ("Эзотерика и специалисты"). Platform + Help stay separate.
  const columns = [
    {
      title: "Разборы",
      links: [
        [mainUrl("/checkin"), "Первичный разбор"],
        [mainUrl("/products/perspectives"), "Полная картина"],
        [mainUrl("/products/deep-report"), "Подробный разбор"],
        [mainUrl("/products/chat-analysis"), "Разбор переписки"],
        [mainUrl("/products/my-map"), "Расширенная карта"],
      ],
    },
    {
      title: "Вместе и практика",
      links: [
        [mainUrl("/products/pair"), "Разобраться вдвоём"],
        [mainUrl("/products/compatibility"), "Совместимость"],
        [mainUrl("/products/circle"), "Круг"],
        [mainUrl("/products/clarity-practice"), "Ежедневная практика"],
        [mainUrl("/products/seven-days"), "7 дней"],
        [mainUrl("/library"), "Библиотека вопросов"],
      ],
    },
    {
      title: "Эзотерика и специалисты",
      links: [
        [mainUrl("/products/tarot"), "Таро"],
        [mainUrl("/products/natal-chart"), "Натальная карта"],
        [mainUrl("/products/synastry"), "Совместимость по звёздам"],
        [mainUrl("/products/numerology"), "Нумерология"],
        [mainUrl("/practitioners"), "Специалисты"],
        [mainUrl("/practitioners/apply"), "Стать специалистом"],
      ],
    },
    {
      title: "Платформа",
      links: [
        [mainUrl("/products"), "Все форматы"],
        [mainUrl("/pricing"), "Тарифы"],
        [mainUrl("/how-it-works"), "Как работает"],
        [mainUrl("/about"), "О проекте"],
        [mainUrl("/telegram"), "Telegram"],
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
