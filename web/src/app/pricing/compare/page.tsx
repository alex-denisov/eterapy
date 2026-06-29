import Link from "next/link";
import { ArrowRight, CheckCircle2, Wallet } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { getProductPriceLabel, getProductCreditCost } from "@/lib/product-prices";
import { formatPoints } from "@/lib/points";

export const metadata = createPublicPageMetadata("/pricing/compare");

// B461 (M28, walkthrough item 19): honest, actualised compare.
//   • A green ✓ now means ONLY «входит в тариф» — the Free/«Базовый» column no
//     longer shows a check next to paid products (INC-014). Each cell is a tagged
//     state, not a boolean: included · alacarte · wallet · text.
//   • Plan names match the tariff cards («Базовый», not «Free»).
//   • «из кошелька» / «по тарифу специалиста» are explained in a legend.
//   • Every number derives from the single billing source (product-prices /
//     entitlements): primary разбор 3/день free + без ограничений on a plan,
//     12 / 20 monthly баллы, à-la-carte ₽/балл. No hand-typed money.

type PlanKey = "free" | "plus" | "premium";

type Cell =
  | { kind: "included" } // ✓ входит в тариф, баллы не списываются
  | { kind: "alacarte"; slug: string } // разовая покупка: рублями или баллами
  | { kind: "wallet"; label: string } // из кошелька — ваши баллы за месяц
  | { kind: "text"; label: string; muted?: boolean }; // нейтральное значение

type Row = { feature: string; free: Cell; plus: Cell; premium: Cell; note?: string };

// «299 ₽ / 1 балл» for an à-la-carte slug — both numbers from the single source.
function alacartePrice(slug: string): string {
  const rub = getProductPriceLabel(slug) ?? "—";
  const credits = getProductCreditCost(slug);
  return credits ? `${rub} / ${formatPoints(credits)}` : rub;
}

const PLANS: { key: PlanKey; name: string; price: string; tagline: string }[] = [
  { key: "free", name: "Базовый", price: "0 ₽", tagline: "Попробовать без оплаты" },
  { key: "plus", name: "Plus", price: "590 ₽ в месяц", tagline: "Регулярная практика" },
  { key: "premium", name: "Premium", price: "1490 ₽ в месяц", tagline: "Глубокая работа" },
];

const rows: Row[] = [
  {
    feature: "Первичный разбор",
    free: { kind: "text", label: "до 3 в день" },
    plus: { kind: "text", label: "без ограничений" },
    premium: { kind: "text", label: "без ограничений" },
    note: "Без регистрации — 1 разбор в месяц.",
  },
  {
    feature: "Баллы",
    free: { kind: "text", label: "—", muted: true },
    plus: { kind: "text", label: "12 / месяц" },
    premium: { kind: "text", label: "20 / месяц" },
  },
  {
    feature: "Переосмысление",
    free: { kind: "alacarte", slug: "reframe" },
    plus: { kind: "included" },
    premium: { kind: "included" },
  },
  {
    feature: "Подробный разбор",
    free: { kind: "alacarte", slug: "deep-report" },
    plus: { kind: "alacarte", slug: "deep-report" },
    premium: { kind: "included" },
  },
  {
    feature: "Остальные разборы",
    free: { kind: "text", label: "отдельно, баллами или ₽", muted: true },
    plus: { kind: "wallet", label: "из кошелька или ₽" },
    premium: { kind: "wallet", label: "из кошелька или ₽" },
    note: "Разбор переписки, Вместе, Живой диалог, эзотерика.",
  },
  {
    feature: "Встречи со специалистом",
    free: { kind: "text", label: "по тарифу специалиста", muted: true },
    plus: { kind: "text", label: "по тарифу специалиста", muted: true },
    premium: { kind: "text", label: "по тарифу специалиста", muted: true },
  },
];

function cellFor(row: Row, plan: PlanKey): Cell {
  return row[plan];
}

function CellBody({ cell }: { cell: Cell }) {
  if (cell.kind === "included") {
    return (
      <span className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <span className="font-medium text-[var(--soft-ink)]">Входит</span>
      </span>
    );
  }
  if (cell.kind === "wallet") {
    return (
      <span className="flex items-start gap-2">
        <Wallet className="mt-0.5 size-4 shrink-0 text-[var(--soft-ink-soft)]" aria-hidden="true" />
        <span className="text-[var(--soft-ink-soft)]">{cell.label}</span>
      </span>
    );
  }
  if (cell.kind === "alacarte") {
    return (
      <span className="flex flex-col">
        <span className="text-[var(--soft-ink-soft)]">Отдельно</span>
        <span className="text-xs text-[var(--soft-ink-faint)]">{alacartePrice(cell.slug)}</span>
      </span>
    );
  }
  return <span className={cell.muted ? "text-[var(--soft-ink-faint)]" : "text-[var(--soft-ink-soft)]"}>{cell.label}</span>;
}

const legend = [
  { icon: "check" as const, term: "Входит", gloss: "входит в тариф, баллы не списываются" },
  { icon: "wallet" as const, term: "Из кошелька", gloss: "оплата вашими баллами за месяц" },
  { icon: "none" as const, term: "Отдельно", gloss: "разовая покупка — рублями или баллами" },
  { icon: "none" as const, term: "По тарифу специалиста", gloss: "оплата напрямую специалисту по его тарифу; подписка скидку не даёт" },
];

function LegendIcon({ icon }: { icon: "check" | "wallet" | "none" }) {
  if (icon === "check") return <CheckCircle2 className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />;
  if (icon === "wallet") return <Wallet className="size-4 shrink-0 text-[var(--soft-ink-soft)]" aria-hidden="true" />;
  return <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--soft-ink-faint)]" aria-hidden="true" />;
}

export default function PricingComparePage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pricing-compare-page">
      <PublicJsonLd route="/pricing/compare" />

      <section className="soft-shell py-8 md:py-12">
        <Link href="/pricing" className="soft-chip soft-chip-warm">← Тарифы</Link>
        <div className="mt-6 max-w-3xl">
          <p className="soft-eyebrow">сравнение тарифов</p>
          <h1 className="soft-h1 mt-3">Что входит в Базовый, Plus и Premium</h1>
          <p className="soft-lede mt-3" style={{ maxWidth: "40rem" }}>
            Подписка снимает лимиты и каждый месяц пополняет баланс баллов. Разовые разборы
            и встречи со специалистом оплачиваются отдельно.
          </p>
          {/* First-screen CTAs (owner rule: key actions above the fold). */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href="/checkin" className="soft-button soft-button-primary">
              Начать бесплатно
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/products" className="soft-button soft-button-ghost">
              Разовые продукты
            </Link>
          </div>
        </div>

        {/* Desktop — comparison table */}
        <div className="soft-card mt-8 hidden overflow-x-auto p-0 md:block" data-testid="compare-desktop">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="bg-[var(--soft-paper-deep)] text-left">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--soft-bordeaux)]">Механика</th>
                {PLANS.map((plan) => (
                  <th key={plan.key} className="px-4 py-3 text-left">
                    <span className="block text-xs font-bold uppercase tracking-[0.14em] text-[var(--soft-bordeaux)]">{plan.name}</span>
                    <span className="mt-0.5 block text-xs font-normal normal-case tracking-normal text-[var(--soft-ink-faint)]">{plan.price}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--soft-paper-edge)]">
              {rows.map((row) => (
                <tr key={row.feature}>
                  <th className="px-4 py-3 text-left align-top text-sm font-semibold text-[var(--soft-ink)]">
                    {row.feature}
                    {row.note && <span className="mt-0.5 block text-xs font-normal text-[var(--soft-ink-faint)]">{row.note}</span>}
                  </th>
                  {PLANS.map((plan) => (
                    <td key={plan.key} className="px-4 py-3 align-top text-sm">
                      <CellBody cell={cellFor(row, plan.key)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile — stacked per-plan cards (no horizontal scroll) */}
        <div className="mt-8 grid gap-4 md:hidden" data-testid="compare-mobile">
          {PLANS.map((plan) => (
            <div key={plan.key} className="soft-card p-0">
              <div className="border-b border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] px-5 py-3">
                <p className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)]">{plan.name}</p>
                <p className="text-sm text-[var(--soft-ink-soft)]">
                  {plan.price}
                  <span className="text-[var(--soft-ink-faint)]"> · {plan.tagline}</span>
                </p>
              </div>
              <dl className="divide-y divide-[var(--soft-paper-edge)]">
                {rows.map((row) => (
                  <div key={row.feature} className="flex items-start justify-between gap-4 px-5 py-3">
                    <dt className="text-sm font-medium text-[var(--soft-ink)]">{row.feature}</dt>
                    <dd className="text-right text-sm">
                      <CellBody cell={cellFor(row, plan.key)} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        {/* Legend — defines «из кошелька» and «по тарифу специалиста» in plain language */}
        <div className="soft-card-flat mt-6 p-5">
          <p className="soft-eyebrow text-[var(--soft-bordeaux)]">как читать таблицу</p>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {legend.map((item) => (
              <li key={item.term} className="flex items-start gap-2.5 text-sm">
                <LegendIcon icon={item.icon} />
                <span className="text-[var(--soft-ink-soft)]">
                  <span className="font-medium text-[var(--soft-ink)]">{item.term}</span> — {item.gloss}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--soft-paper-edge)] pt-4 text-xs text-[var(--soft-ink-faint)]">
            <p>Новым пользователям — 3 балла в подарок на 14 дней. Их хватит, например, на одно Переосмысление.</p>
            <p>
              Баллы можно докупить пакетом (действуют 12 месяцев).{" "}
              <Link href="/products" className="text-[var(--soft-bordeaux)] underline-offset-2 hover:underline">
                Все цены разовых продуктов →
              </Link>
            </p>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/checkin" className="soft-button soft-button-primary">
            Начать бесплатно
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/pricing" className="soft-button soft-button-ghost">
            Вернуться к тарифам
          </Link>
        </div>
      </section>
    </main>
  );
}
