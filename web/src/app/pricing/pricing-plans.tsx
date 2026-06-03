"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const plans = [
  {
    id: "free",
    name: "Базовый",
    tagline: "Чтобы попробовать",
    monthPrice: 0,
    yearPrice: 0,
    perks: [
      "Первый разбор бесплатно",
      "Доступ к библиотеке вопросов",
      "1 разбор в неделю",
      "Карточка для шеринга — 2 шаблона",
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
    tagline: "Для регулярной практики ясности",
    monthPrice: 490,
    yearPrice: 4900,
    // X18: honest perks — Plus bundles only `perspectives`
    // (V5_SUBSCRIPTION_PLANS.plus.includedProducts) + credits. Dropped the
    // «расширенная карта» claim (my-map moved to Premium) and the «напоминания
    // /Telegram» line (those are available to every user, not a Plus exclusive).
    perks: [
      "+10 кредитов ясности каждый месяц",
      "4 ракурса ответа включены — без доплат",
      "Кредитами оплачивайте любой цифровой формат",
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
    monthPrice: 1290,
    yearPrice: 12900,
    // W19: the previous four perks were vaporware (no feature backed them).
    // Replaced with honest perks mapped to V5_SUBSCRIPTION_PLANS.premium —
    // 9 included digital products + 30 credits + the annual map portrait.
    perks: [
      "Всё из Plus",
      "+30 кредитов ясности каждый месяц",
      "9 цифровых форматов включены без доплат",
      "Глубокий отчёт и разбор переписки — без доплат",
      "Годовой портрет паттернов в Моей карте",
    ],
    cta: "Подключить Premium",
    href: "/cabinet/billing?plan=premium",
    featured: false,
    dark: true,
    style: { background: "var(--soft-bordeaux, #5c2a2c)" } as React.CSSProperties,
  },
];

// W19: prices reconciled with the canonical catalog (lib/v5-products.ts) —
// deep-report 690 (was 590), compatibility 790 (was 590–990), the phantom
// "Разбор переписки Deep/Pro 890–1490" row removed (that tier no longer
// exists), natal-chart synastry note added. Session rows moved to a separate
// DB-priced block (see sessionRows) so they reflect the real PriceRate floor.
const oneOff = [
  { cat: "Бесплатный вход", t: "Первичный разбор", d: "С уточнениями + основной ответ", price: "Бесплатно", href: "/checkin", cta: "Начать" },
  { cat: "Цифровые углубления", t: "4 ракурса ответа", d: "Разум · Чувства · Символ · Действие", price: "299 ₽", href: "/products/perspectives", cta: "Заказать" },
  { cat: "Цифровые углубления", t: "Глубокий отчёт", d: "Документ-разбор · 10–15 страниц", price: "690 ₽", href: "/products/deep-report", cta: "Заказать" },
  { cat: "Цифровые углубления", t: "Разбор переписки", d: "Тон, динамика, варианты ответа", price: "390 ₽", href: "/products/chat-analysis", cta: "Разобрать" },
  { cat: "Для двоих и круга", t: "Совместимость", d: "Парный отчёт по приглашению, начало бесплатно", price: "790 ₽", href: "/products/compatibility", cta: "Создать" },
  { cat: "Для двоих и круга", t: "Круг ясности", d: "2–5 участников и общий итог", price: "790 ₽", href: "/products/circle", cta: "Создать" },
  { cat: "Для двоих и круга", t: "Разобраться вдвоём", d: "Отдельные ответы + общий результат", price: "790 ₽", href: "/products/pair", cta: "Пригласить" },
  { cat: "Маршруты и карта", t: "Практика ясности", d: "Базовый ритм бесплатно, расширение по запросу", price: "0–199 ₽", href: "/products/clarity-practice", cta: "Открыть" },
  { cat: "Маршруты и карта", t: "7 дней к ясности", d: "Один шаг в день, 5–10 мин · день 1 бесплатно", price: "990 ₽", href: "/products/seven-days", cta: "Начать" },
  { cat: "Маршруты и карта", t: "Расширенная карта", d: "Годовой портрет паттернов · история и темы", price: "990 ₽", href: "/products/my-map", cta: "Расширить" },
  { cat: "Эзотерика", t: "Расклад Таро", d: "Символический разбор развилки", price: "390 ₽", href: "/products/tarot", cta: "Купить" },
  { cat: "Эзотерика", t: "Натальная карта", d: "Базовый разбор · синастрия с партнёром 990 ₽", price: "590 ₽", href: "/products/natal-chart", cta: "Купить" },
  { cat: "Эзотерика", t: "Числовой портрет", d: "Имя, дата и цикл года", price: "390 ₽", href: "/products/numerology", cta: "Купить" },
];

const oneOffCats = ["Бесплатный вход", "Цифровые углубления", "Для двоих и круга", "Маршруты и карта", "Эзотерика", "Встречи"];

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
    { cat: "Встречи", t: "Эзотерик + психотерапевт", d: "Совместная сессия двух специалистов", price: "по записи", href: "/products/joint-session", cta: "Посмотреть" },
  ];
}

function formatPrice(n: number): string {
  if (n === 0) return "Бесплатно";
  return n.toLocaleString("ru-RU") + " ₽";
}

export function PricingPlans({ minSessionPriceRub = null }: { minSessionPriceRub?: number | null }) {
  const [period, setPeriod] = useState<"month" | "year">("month");
  const sessionRows = buildSessionRows(minSessionPriceRub);
  const itemsForCat = (cat: string) => (cat === "Встречи" ? sessionRows : oneOff.filter((item) => item.cat === cat));

  return (
    <>
      {/* Hero */}
      <section className="soft-shell" style={{ paddingBlock: "clamp(3rem, 7vw, 5.5rem) clamp(1.5rem, 4vw, 3rem)" }}>
        <div style={{ maxWidth: "48rem", marginInline: "auto", textAlign: "center" }}>
          <p className="soft-eyebrow">тарифы</p>
          <h1 className="soft-h1 mt-4">
            Платите за <em className="soft-italic">ясность</em>, а не за подписку «на всякий случай»
          </h1>
          <p className="soft-lede mt-5" style={{ maxWidth: "38rem", marginInline: "auto" }}>
              Один разбор всегда бесплатный. Подписка — для практики и цифровых углублений.
              Встречи со специалистом оплачиваются отдельно по полной цене, без скидок в тарифах.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <button
              className={"soft-chip" + (period === "month" ? " soft-chip-warm" : "")}
              onClick={() => setPeriod("month")}
            >
              Помесячно
            </button>
            <button
              className={"soft-chip" + (period === "year" ? " soft-chip-warm" : "")}
              onClick={() => setPeriod("year")}
            >
              На год <span style={{ opacity: 0.72, marginLeft: "0.25rem" }}>· 2 месяца в подарок</span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="soft-shell soft-public-section">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {plans.map((plan) => {
            const price = period === "year" ? plan.yearPrice : plan.monthPrice;
            const periodLabel = period === "year" ? "в год" : "в месяц";
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
