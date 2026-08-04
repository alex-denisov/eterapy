import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-mark";
import { mainUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

export function Footer({ variant = "soft", compact = false }: { variant?: "dark" | "soft"; compact?: boolean }) {
  const soft = variant === "soft";
  // PRB-002: inline-block + py-1 доводит touch-target ссылки до ≥24px по
  // высоте (Lighthouse target-size); -my-0.5 компенсирует визуальный ритм.
  const linkCls = cn("inline-block py-1 -my-0.5 hover:text-foreground transition-colors", soft && "hover:text-[var(--soft-bordeaux)]");
  const mutedCls = cn("text-muted-foreground", compact ? "space-y-1" : "space-y-1.5", soft && "text-[var(--soft-ink-faint)]");
  const titleCls = cn("font-semibold", compact ? "mb-1" : "mb-2", soft ? "text-[var(--soft-bordeaux)]" : "text-foreground");
  // B380: footer condensed from 5 → 4 columns and restructured under the M26
  // catalogue groups. Retired/dead service routes were removed in B373.
  // The footer is navigation, not a price list (G2) — labels carry no "₽".
  // B395: `compact` (product/tool pages) ONLY tightens type + spacing so the
  // footer doesn't dominate the first screen — it keeps every link (an earlier
  // variant stripped links to four; owner asked to keep them all, just denser).
  const columns = [
    {
      title: "Разборы",
      links: [
        [mainUrl("/"), "Разобрать бесплатно"],
        // B657: `/ai-psychologist` несёт единственный кластер, в котором сайт
        // реально ранжируется («ии психолог» — 13 380 показов/мес, позиции
        // 1–16), и при этом на неё не вело НИ ОДНОЙ внутренней ссылки. Подвал
        // даёт сквозную ссылку со всех страниц — самый дешёвый вес.
        [mainUrl("/ai-psychologist"), "ИИ-психолог"],
        [mainUrl("/products/reframe"), "Переосмысление"],
        [mainUrl("/products/deep-report"), "Подробный разбор"],
        [mainUrl("/products/chat-analysis"), "Разбор переписки"],
        [mainUrl("/products/pair"), "Вместе"],
      ],
    },
    {
      title: "Эзотерика",
      links: [
        [mainUrl("/products/tarot"), "Таро"],
        [mainUrl("/products/natal-chart"), "Натальная карта"],
        [mainUrl("/products/compatibility-by-date"), "Совместимость по дате"],
        [mainUrl("/products/numerology"), "Нумерология"],
      ],
    },
    {
      title: "Платформа",
      links: [
        [mainUrl("/products"), "Все форматы"],
        [mainUrl("/practitioners"), "Специалисты"],
        [mainUrl("/practitioners/apply"), "Стать специалистом"],
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
        [mainUrl("/legal/offer"), "Договор-оферта"],
      ],
    },
  ];

  return (
    <footer
      data-testid="public-shell-footer"
      data-site-chrome="footer"
      className={cn("border-t border-[var(--soft-paper-edge)]/60 bg-[var(--soft-paper)]", soft && "soft-footer")}
    >
      <div className={cn("mx-auto max-w-6xl px-4", compact ? "py-5" : "py-8")}>
        <div className={cn("flex flex-col lg:flex-row lg:items-start lg:justify-between", compact ? "gap-5" : "gap-8")}>
          <BrandLogo height={compact ? 26 : 34} theme={soft ? "light" : "dark"} />

          <div className={cn("soft-footer-columns grid flex-1", compact ? "gap-x-6 gap-y-4 text-[12.5px]" : "gap-x-8 gap-y-6 text-sm")}>
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

        <p className={cn("border-t text-xs text-muted-foreground", compact ? "mt-4 pt-3.5" : "mt-6 pt-5", soft ? "border-[var(--soft-paper-edge)] text-[var(--soft-ink-faint)]" : "border-border/30")}>
          © {new Date().getFullYear()} ETerapy. Все услуги носят ознакомительный характер — не являются медицинской, юридической или финансовой помощью.
        </p>
      </div>
    </footer>
  );
}
