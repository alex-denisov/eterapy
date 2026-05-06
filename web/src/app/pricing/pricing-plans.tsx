"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const plans = [
  {
    id: "free",
    name: "Базовый",
    tagline: "Чтобы попробовать",
    price: "0 ₽",
    perks: [
      "Первый разбор бесплатно",
      "Доступ к библиотеке вопросов",
      "1 разбор в неделю",
      "Карточка для шеринга — 2 шаблона",
    ],
    cta: "Начать",
    href: "/all-modalities/checkin",
    featured: false,
    dark: false,
    style: {} as React.CSSProperties,
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Для регулярной практики ясности",
    price: "399-599 ₽/мес",
    perks: [
      "Безлимитные разборы и уточнения",
      "4 ракурса · разбор переписки · совместимость",
      "Моя карта ETerapy с историей и темами",
      "Маршрут «7 дней к ясности»",
      "Скидка 10% на встречи со специалистами",
    ],
    cta: "Подключить Plus",
    href: "/all-modalities/checkin",
    featured: true,
    dark: false,
    style: { background: "linear-gradient(160deg, #f4d9c1, #f8e6d1)" } as React.CSSProperties,
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "С поддержкой проверенного специалиста",
    price: "999-1490 ₽/мес",
    perks: [
      "Всё из Plus",
      "1 встреча с психологом или коучем в месяц",
      "Приоритетная запись к специалистам",
      "Личный куратор в чате",
      "Скидка 20% на дополнительные встречи",
    ],
    cta: "Подключить Premium",
    href: "/all-modalities/checkin",
    featured: false,
    dark: true,
    style: { background: "var(--soft-bordeaux, #5c2a2c)" } as React.CSSProperties,
  },
];

const practitionerPrice = "990-2990 ₽/мес";

const oneOff = [
  { t: "Первичный разбор", d: "С уточнениями + основной ответ", price: "Бесплатно" },
  { t: "4 ракурса ответа", d: "Разум · Чувства · Символ · Действие", price: "299 ₽" },
  { t: "Глубокий отчёт", d: "Документ-разбор ситуации", price: "490-990 ₽" },
  { t: "Разбор переписки", d: "До 50 / 200 / 500 сообщений", price: "299-1490 ₽" },
  { t: "Совместимость", d: "Парный отчёт по приглашению", price: "590-990 ₽" },
  { t: "7 дней к ясности", d: "Один разбор в день, 5–10 мин", price: "790-1490 ₽" },
  { t: "Встреча с психологом", d: "50 минут онлайн", price: "от 1 900 ₽" },
  { t: "Коуч-сессия", d: "Карьера · переход · призвание", price: "от 2 500 ₽" },
  { t: "Парная встреча", d: "Семейный психолог", price: "от 5 000 ₽" },
  { t: "Совместная сессия", d: "Эзотерик + психотерапевт", price: "от 4 500 ₽", soon: true },
];

export function PricingPlans() {
  const [period, setPeriod] = useState<"month" | "year">("month");

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
            Один разбор всегда бесплатный. Подписка — для тех, кто возвращается. Встречи со специалистом — отдельно, без скрытых наценок.
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
          {plans.map((plan) => (
              <div
                key={plan.id}
                className="soft-card"
                style={{
                  position: "relative",
                  padding: "1.75rem",
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

                <p
                  className="font-heading"
                  style={{
                    fontSize: "2.25rem",
                    fontWeight: 600,
                    marginTop: "1.25rem",
                    lineHeight: 1,
                    color: plan.dark ? "#f4d9c1" : "var(--soft-bordeaux)",
                  }}
                >
                  {plan.price}
                </p>

                <ul className="mt-6 space-y-2.5">
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
          ))}
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--soft-ink-faint)", maxWidth: "38rem", marginInline: "auto" }}>
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
              Каждый формат можно купить без подписки. С Plus — все цифровые входят, встречи со скидкой.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2">
            {oneOff.map((item, i) => (
              <div
                key={item.t}
                className="flex items-center justify-between gap-4 border-t py-4 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                style={{
                  borderColor: "var(--soft-paper-edge)",
                  opacity: item.soon ? 0.6 : 1,
                  paddingLeft: i % 2 === 1 ? "1.25rem" : "0",
                  paddingRight: i % 2 === 0 ? "1.25rem" : "0",
                }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--soft-ink)" }}>
                    {item.t}
                    {item.soon && (
                      <span
                        className="soft-badge ml-2"
                        style={{ fontSize: "0.65rem", verticalAlign: "middle" }}
                      >
                        скоро
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                    {item.d}
                  </p>
                </div>
                <span
                  className="font-heading font-semibold shrink-0"
                  style={{ color: "var(--soft-bordeaux)", fontSize: "1rem", whiteSpace: "nowrap" }}
                >
                  {item.price}
                </span>
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
                Подключайтесь к платформе. Мы берём 15–25% комиссии за привязанные через ETerapy сессии.
                Никаких ежемесячных платежей за листинг. Деньги поступают на счёт еженедельно.
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-faint)" }}>
                Practitioner Pro: {practitionerPrice} — AI-саммари, контекст по согласию, аналитика.
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
                Открыть кабинет специалиста
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
          href="/all-modalities/checkin"
          className="soft-button soft-button-primary mt-7"
          data-analytics-event="dialogue_cta_clicked"
          data-analytics-target="/all-modalities/checkin"
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
