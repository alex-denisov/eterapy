import Link from "next/link";
import { ArrowRight, CheckCircle2, MinusCircle } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/pricing/compare");

const rows = [
  ["Первичный разбор", "1 / день", "3 / день", "без лимита"],
  ["Баллы", "3 в подарок (14 дн)", "12 / месяц", "35 / месяц"],
  ["4 ракурса ответа", "1 балл / 299 ₽", "включено без баллов", "включено без баллов"],
  ["Глубокий отчёт", "4 балла / 690 ₽", "4 балла из кошелька", "включено без баллов"],
  ["Разбор переписки", "2 балла / 390 ₽", "2 балла из кошелька", "2 балла из кошелька"],
  ["Совместимость («Вы двое»)", "4 балла / 790 ₽", "4 балла из кошелька", "4 балла из кошелька"],
  ["7 дней к ясности", "8 баллов / 990 ₽", "8 баллов из кошелька", "8 баллов из кошелька"],
  ["Моя карта", "ограниченная история", "история и темы", "расширенная карта и аналитика"],
  ["Встречи со специалистами", "по тарифу специалиста", "по тарифу специалиста", "по тарифу специалиста"],
];

function Cell({ value }: { value: string }) {
  const included = !["нет", "не входит"].includes(value);
  return (
    <td className="px-4 py-3 align-top text-sm text-[var(--soft-ink-soft)]">
      <span className="flex gap-2">
        {included ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        ) : (
          <MinusCircle className="mt-0.5 size-4 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
        )}
        <span>{value}</span>
      </span>
    </td>
  );
}

export default function PricingComparePage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pricing-compare-page">
      <PublicJsonLd route="/pricing/compare" />

      <section className="soft-shell py-12 md:py-16">
        <Link href="/pricing" className="soft-chip soft-chip-warm">← Тарифы</Link>
        <div className="mt-8 max-w-3xl">
          <p className="soft-eyebrow">сравнение тарифов</p>
          <h1 className="soft-h1 mt-3">Что входит в Free, Plus и Premium</h1>
          <p className="soft-lede mt-5">
            Подписка не заменяет разовые продукты и не делает встречи со специалистами дешевле.
            Она продаёт регулярность, баллы, историю и расширенную карту.
          </p>
        </div>

        <div className="soft-card mt-8 overflow-x-auto p-0">
          <table className="min-w-[820px] w-full border-collapse">
            <thead>
              <tr className="bg-[var(--soft-paper-deep)] text-left">
                {["Механика", "Free", "Plus", "Premium"].map((head) => (
                  <th key={head} className="px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--soft-bordeaux)]">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--soft-paper-edge)]">
              {rows.map(([feature, free, plus, premium]) => (
                <tr key={feature}>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--soft-ink)]">{feature}</th>
                  <Cell value={free} />
                  <Cell value={plus} />
                  <Cell value={premium} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/checkin" className="soft-button soft-button-primary">
            Начать бесплатно
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/products" className="soft-button soft-button-ghost">
            Смотреть разовые продукты
          </Link>
        </div>
      </section>
    </main>
  );
}
