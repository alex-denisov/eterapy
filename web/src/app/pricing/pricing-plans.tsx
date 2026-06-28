"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { getProductPriceLabel } from "@/lib/product-prices";

// B366: à-la-carte prices derive from the single billing source.
const price = (slug: string): string => getProductPriceLabel(slug) ?? "—";

const plans = [
  {
    id: "free",
    name: "Базовый",
    tagline: "Чтобы попробовать",
    monthPrice: 0,
    // B371: «Карточка для шеринга — 2 шаблона» убрана — механики шаринга-шаблонов нет.
    perks: [
      "Первый разбор бесплатно",
      "Доступ к библиотеке вопросов",
      "1 разбор в неделю",
    ],
    cta: "Начать",
    href: "/checkin",
    featured: false,
    dark: false,
    style: {} as React.CSSProperties,
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Для регулярной практики",
    monthPrice: 590,
    // X18/Z2: honest perks — Plus bundles only `perspectives`
    // (V5_SUBSCRIPTION_PLANS.plus.includedProducts) + credits. The retired
    // «Расширенная карта» is gone; everything else is a credit/card purchase.
    // Reminders/Telegram are available to every user, not a Plus exclusive.
    perks: [
      "+12 баллов каждый месяц",
      "Переосмысление включено — без баллов, без лимита",
      "Баллами оплачивайте любой цифровой формат",
      "Моя карта: история разборов и темы",
      "Без скидок на встречи — полная ставка специалиста",
    ],
    cta: "Подключить Plus",
    href: "/cabinet/billing?plan=plus",
    featured: true,
    dark: false,
    style: { background: "linear-gradient(160deg, #f4d9c1, #f8e6d1)" } as React.CSSProperties,
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Для глубокой регулярной работы",
    monthPrice: 1490,
    // Z2 credit-centric (docs/v5-release/MONETIZATION-STRATEGY-Y10 §3): Premium
    // includes only two anchors (perspectives + deep-report) + 20 monthly credits;
    // the rest of the catalog (chat-analysis, «Вы двое», круг, совместимость по
    // звёздам, …) is paid from the wallet — NOT bundled free. Perks must not
    // claim otherwise.
    perks: [
      "Всё из Plus",
      "+20 баллов каждый месяц",
      "Переосмысление + Подробный разбор включены без баллов",
      "Весь премиальный каталог — из кошелька баллов",
    ],
    cta: "Подключить Premium",
    href: "/cabinet/billing?plan=premium",
    featured: false,
    dark: true,
    style: { background: "var(--soft-bordeaux, #5c2a2c)" } as React.CSSProperties,
  },
];

// B366/B371: prices derive from the single billing source (no hand-typed ₽).
// B371 cleanup: «Маршруты и карта» категория убрана целиком (Ежедневная практика
// бесплатна и живёт в кабинете; «7 дней» и «Расширенная карта» закрыты,
// роуты выпиливаются в B373); «Круг» закрыт (→ «Вместе» в B385).
const oneOff = [
  { cat: "Бесплатный вход", t: "Первичный разбор", d: "С уточнениями + основной ответ", price: "Бесплатно", href: "/checkin", cta: "Начать" },
  { cat: "Цифровые углубления", t: "Переосмысление", d: "Когнитивный рефрейминг · Мысли · Чувства · Другой взгляд · Шаг", price: price("reframe"), href: "/products/reframe", cta: "Заказать" },
  { cat: "Цифровые углубления", t: "Подробный разбор", d: "Документ-разбор · 6–10 страниц", price: price("deep-report"), href: "/products/deep-report", cta: "Заказать" },
  { cat: "Цифровые углубления", t: "Разбор переписки", d: "Тон, динамика, варианты ответа", price: price("chat-analysis"), href: "/products/chat-analysis", cta: "Разобрать" },
  { cat: "Для двоих", t: "Вместе", d: "Взгляд со стороны, сверить взгляды или совместимость — начало бесплатно", price: price("pair"), href: "/products/pair", cta: "Пригласить" },
  { cat: "Эзотерика", t: "Расклад Таро", d: "Символический разбор развилки", price: price("tarot"), href: "/products/tarot", cta: "Купить" },
  { cat: "Эзотерика", t: "Натальная карта", d: `Базовый разбор · совместимость по звёздам с партнёром ${price("synastry")}`, price: price("natal-chart"), href: "/products/natal-chart", cta: "Купить" },
  { cat: "Эзотерика", t: "Совместимость по звёздам", d: "Две натальные карты · карта пары", price: price("synastry"), href: "/products/synastry", cta: "Собрать" },
  { cat: "Эзотерика", t: "Числовой портрет", d: "Имя, дата и цикл года", price: price("numerology"), href: "/products/numerology", cta: "Купить" },
];

const oneOffCats = ["Бесплатный вход", "Цифровые углубления", "Для двоих", "Эзотерика", "Встречи"];

// W19: session prices come from the real PriceRate floor (passed from the
// server), never a hardcoded fiction. Specialties without a published rate show
// "по записи" — the exact price is always visible in the specialist's profile.
function buildSessionRows(minSessionPriceRub: number | null) {
  const floor = minSessionPriceRub ? `от ${minSessionPriceRub.toLocaleString("ru-RU")} ₽` : "по записи";
  return [
    { cat: "Встречи", t: "Встреча с психологом", d: "60 минут онлайн", price: floor, href: "/practitioners?format=psychology", cta: "Записаться" },
    { cat: "Встречи", t: "Коуч-сессия", d: "Карьера · переход · призвание", price: "по записи", href: "/practitioners?format=coaching", cta: "Записаться" },
    { cat: "Встречи", t: "Юрист", d: "Семейное право, развод, опека", price: "по записи", href: "/practitioners?format=legal", cta: "Записаться" },
    { cat: "Встречи", t: "Финансовый консультант", d: "Бюджет, долги, инвестиции", price: "по записи", href: "/practitioners?format=finance", cta: "Записаться" },
  ];
}

function formatPrice(n: number): string {
  if (n === 0) return "Бесплатно";
  return n.toLocaleString("ru-RU") + " ₽";
}

export function PricingPlans({ minSessionPriceRub = null }: { minSessionPriceRub?: number | null }) {
  const sessionRows = buildSessionRows(minSessionPriceRub);
  const itemsForCat = (cat: string) => (cat === "Встречи" ? sessionRows : oneOff.filter((item) => item.cat === cat));

  return (
    <>
      {/* Hero — B454/B396: tightened so the plan cards + their CTAs reach the
          first screen (top pad cut, no bottom pad, lede trimmed to one line). */}
      <section className="soft-shell" style={{ paddingBlock: "clamp(1.5rem, 3.5vw, 2.5rem) 0" }}>
        <div style={{ maxWidth: "48rem", marginInline: "auto", textAlign: "center" }}>
          <p className="soft-eyebrow">тарифы</p>
          <h1 className="soft-h1 mt-3">
            Платите за <em className="soft-italic">результат</em>, а не за подписку «на всякий случай»
          </h1>
          <p className="soft-lede mt-4" style={{ maxWidth: "38rem", marginInline: "auto" }}>
              Один разбор всегда бесплатный. Подписка — для цифровых углублений; встречи со
              специалистом оплачиваются отдельно по полной цене.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="soft-shell soft-public-section" style={{ paddingBlockStart: "clamp(1rem, 2.5vw, 1.5rem)" }}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {plans.map((plan) => {
            // Механика 1: подписки только месячные — годовых планов нет.
            const price = plan.monthPrice;
            const periodLabel = "в месяц";
            return (
              <div
                key={plan.id}
                className="soft-card"
                style={{
                  position: "relative",
                  padding: "1.75rem",
                  display: "flex",
                  flexDirection: "column",
                  outline: plan.featured ? "2px solid var(--soft-terracotta-dark, #b85b40)" : "none",
                  outlineOffset: "0",
                  color: plan.dark ? "#fbf0e1" : "var(--soft-ink)",
                  ...plan.style,
                }}
                data-testid={`pricing-plan-${plan.id}`}
              >
                {plan.featured && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-0.8rem",
                      left: "1.5rem",
                      background: "var(--soft-terracotta-dark, #b85b40)",
                      color: "#fbf0e1",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "0.3rem 0.85rem",
                      borderRadius: "999px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    популярный
                  </span>
                )}

                <p
                  className="font-heading"
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 500,
                    color: plan.dark ? "#fbf0e1" : "var(--soft-bordeaux)",
                  }}
                >
                  {plan.name}
                </p>
                <p
                  style={{
                    fontSize: "0.875rem",
                    marginTop: "0.25rem",
                    opacity: plan.dark ? 0.78 : 0.65,
                  }}
                >
                  {plan.tagline}
                </p>

                <div style={{ marginTop: "1.25rem" }}>
                  <span
                    className="font-heading"
                    style={{
                      fontSize: "2.25rem",
                      fontWeight: 600,
                      lineHeight: 1,
                      color: plan.dark ? "#f4d9c1" : "var(--soft-bordeaux)",
                    }}
                    data-testid={`pricing-plan-price-${plan.id}`}
                  >
                    {formatPrice(price)}
                  </span>
                  {price > 0 && (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        marginLeft: "0.5rem",
                        opacity: plan.dark ? 0.65 : 0.55,
                      }}
                    >
                      {periodLabel}
                    </span>
                  )}
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0"
                        style={{ color: plan.dark ? "#f4d9c1" : "var(--soft-terracotta-dark)" }}
                        aria-hidden="true"
                      />
                      <span style={{ opacity: plan.dark ? 0.88 : 1 }}>{perk}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  prefetch={plan.href.startsWith("/cabinet/") ? false : undefined}
                  className="soft-button mt-6 w-full justify-center"
                  style={
                    plan.dark
                      ? { background: "#f4d9c1", color: "var(--soft-bordeaux, #5c2a2c)", border: "none" }
                      : plan.featured
                        ? { background: "var(--soft-terracotta)", color: "#fff8f1", border: "none", boxShadow: "0 10px 26px -12px rgba(214,117,88,.72)" }
                        : undefined
                  }
                  data-analytics-event="pricing_plan_clicked"
                  data-analytics-target={plan.id}
                >
                  {plan.cta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex justify-center">
          <Link href="/pricing/compare" className="soft-button soft-button-ghost">
            Подробное сравнение тарифов
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--soft-ink-faint)", maxWidth: "38rem", marginInline: "auto" }}>
          Подписку можно отменить в один клик в кабинете. Возврат за неиспользованный период по запросу.
        </p>
      </section>

      {/* One-off prices */}
      <section className="soft-shell soft-public-section">
        <div className="soft-card" style={{ padding: "clamp(1.25rem, 3vw, 2rem)" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="soft-eyebrow">разовые форматы</p>
              <h2 className="soft-h2 mt-2">Если подписка не нужна</h2>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-faint)", maxWidth: "18rem", textAlign: "right" }}>
              Каждый цифровой формат можно купить без подписки. Встречи со специалистами оплачиваются отдельно по полной цене.
            </p>
          </div>

          <div className="mt-7 grid gap-4">
            {oneOffCats.map((cat) => (
              <div key={cat} className="overflow-hidden rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
                <div className="flex items-center justify-between gap-3 bg-[var(--soft-paper-deep)] px-5 py-3">
                  <p className="soft-eyebrow text-[var(--soft-bordeaux)]">{cat}</p>
                  <span className="text-xs text-[var(--soft-ink-faint)]">{itemsForCat(cat).length} формата</span>
                </div>
                <div className="divide-y divide-[var(--soft-paper-edge)]">
                  {itemsForCat(cat).map((item) => (
                    <div key={`${cat}-${item.t}`} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                      <div>
                        <p className="text-sm font-semibold text-[var(--soft-ink)]">{item.t}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--soft-ink-faint)]">{item.d}</p>
                      </div>
                      <span className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)] md:text-right">{item.price}</span>
                      <Link href={item.href} className="soft-chip justify-center md:min-w-28">
                        {item.cta}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Practitioners */}
      <section className="soft-shell soft-public-section">
        <div
          className="soft-card"
          style={{
            background: "linear-gradient(140deg, #dbd3ea, #e8e1f2)",
            padding: "clamp(1.5rem, 3vw, 2.5rem)",
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div style={{ maxWidth: "30rem" }}>
              <p className="soft-eyebrow">для специалистов</p>
              <h2 className="soft-h2 mt-3">Психолог, коуч, юрист, эзотерик?</h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                Это отдельная B2B-страница, не клиентский тариф. На старте нет ежемесячной платы за листинг:
                комиссия зависит от источника клиента и формата встречи.
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                Специалист появляется в рекомендации только после того, как вы изложили суть вопроса,
                а не как первый экран.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {["Свободный график", "Безопасные платежи", "Инструменты совместных сессий"].map((perk) => (
                <div key={perk} className="flex items-center gap-2.5 text-sm" style={{ color: "var(--soft-ink)" }}>
                  <CheckCircle2
                    className="size-4 shrink-0"
                    style={{ color: "var(--soft-bordeaux)" }}
                    aria-hidden="true"
                  />
                  {perk}
                </div>
              ))}
              <Link
                href="/practitioners/apply"
                className="soft-button soft-button-primary mt-2"
                data-analytics-event="pricing_practitioners_cta"
              >
                Стать специалистом
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="soft-shell soft-public-section pb-20 text-center">
        <h2 className="soft-h2">Готовы начать?</h2>
        <p className="soft-lede mt-4" style={{ maxWidth: "30rem", marginInline: "auto" }}>
          Первый разбор — бесплатно, без карты, без регистрации.
        </p>
        <Link
          href="/checkin"
          className="soft-button soft-button-primary mt-7"
          data-analytics-event="dialogue_cta_clicked"
          data-analytics-target="/checkin"
          data-testid="pricing-dialogue-cta"
        >
          Задать вопрос
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <p className="mt-6 text-xs" style={{ color: "var(--soft-ink-faint)", maxWidth: "36rem", marginInline: "auto" }}>
          Углублённые отчёты открываются только после вашего явного согласия на покупку.
          Цена сессии всегда видна до оплаты — никаких сюрпризов при бронировании.
        </p>
      </section>
    </>
  );
}
