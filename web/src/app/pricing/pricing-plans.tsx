"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

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

function formatPrice(n: number): string {
  if (n === 0) return "Бесплатно";
  return n.toLocaleString("ru-RU") + " ₽";
}

export function PricingPlans() {
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

      {/* B396: the long à-la-carte catalog table was removed — it duplicated the
          /products catalog and /pricing/compare (already linked under the plans).
          A slim bridge to the catalog replaces it; no second compare button. */}
      <section className="soft-shell soft-public-section" style={{ paddingBlock: "clamp(1rem, 2.5vw, 1.5rem)" }}>
        <div style={{ maxWidth: "34rem", marginInline: "auto", textAlign: "center" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            Не нужна подписка? Любой формат покупается разово — все они собраны в каталоге услуг.
          </p>
          <div className="mt-5 flex justify-center">
            <Link href="/products" className="soft-button soft-button-primary" data-testid="pricing-catalog-cta">
              Смотреть все форматы
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
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
