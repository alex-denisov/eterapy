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
    perks: [
      "+10 кредитов ясности каждый месяц",
      "4 ракурса · отчёт · переписка · совместимость",
      "Моя карта ETerapy с историей и темами",
      "Мягкие напоминания и Telegram-карта дня",
      "Без скидок на встречи со специалистами",
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
    tagline: "С поддержкой проверенного специалиста",
    monthPrice: 1290,
    yearPrice: 12900,
    perks: [
      "Всё из Plus",
      "+30 кредитов ясности каждый месяц",
      "Приоритетная поддержка по цифровым продуктам",
      "Приоритетная запись к специалистам",
      "Личный куратор в чате",
      "Расширенная аналитика личной карты",
    ],
    cta: "Подключить Premium",
    href: "/cabinet/billing?plan=premium",
    featured: false,
    dark: true,
    style: { background: "var(--soft-bordeaux, #5c2a2c)" } as React.CSSProperties,
  },
  {
    id: "practitioner",
    name: "Practitioner Pro",
    tagline: "Для специалистов",
    monthPrice: 1490,
    yearPrice: 14900,
    perks: [
      "Кабинет специалиста и расписание",
      "Заявки, клиенты и история выплат",
      "AI-саммари после сессии",
      "Контекст предразбора только по согласию клиента",
      "Комиссия платформы прозрачна: 15–25%",
    ],
    cta: "Стать специалистом",
    href: "/practitioners/apply",
    featured: false,
    dark: false,
    style: { background: "linear-gradient(160deg, #d6decc, #e5ebdc)" } as React.CSSProperties,
  },
];

const practitionerPrices = { month: 1490, year: 14900 };

const oneOff = [
  { t: "Первичный разбор", d: "С уточнениями + основной ответ", price: "Бесплатно" },
  { t: "Быстрый дополнительный разбор", d: "Короткое уточнение без полного отчёта", price: "99–199 ₽" },
  { t: "4 ракурса ответа", d: "Разум · Чувства · Символ · Действие", price: "299 ₽" },
  { t: "Глубокий отчёт", d: "Документ-разбор · 10–15 страниц", price: "590 ₽" },
  { t: "Глубокий отчёт Pro", d: "Максимальная глубина и план действий", price: "990 ₽" },
  { t: "Разбор переписки Start", d: "Быстрое наблюдение по переписке", price: "390 ₽" },
  { t: "Разбор переписки Deep", d: "Тон, динамика и варианты ответа", price: "890 ₽" },
  { t: "Разбор переписки Pro", d: "Глубокий анализ + расширенные формулировки", price: "1 490 ₽" },
  { t: "Совместимость Start", d: "Парный отчёт по приглашению", price: "590 ₽" },
  { t: "Совместимость Pro", d: "Сценарии общения и план", price: "990 ₽" },
  { t: "Круг ясности", d: "2–5 участников и общий итог", price: "790 ₽" },
  { t: "Разобраться вдвоём", d: "Отдельные ответы + общий результат", price: "790 ₽" },
  { t: "7 дней к ясности", d: "Один разбор в день, 5–10 мин", price: "990 ₽" },
  { t: "Практика ясности", d: "Базовый ритм бесплатно, расширение по запросу", price: "0–199 ₽" },
  { t: "Встреча с психологом", d: "50 минут онлайн", price: "от 4 500 ₽" },
  { t: "Коуч-сессия", d: "Карьера · переход · призвание", price: "от 3 200 ₽" },
  { t: "Парная встреча", d: "Семейный психолог", price: "от 7 200 ₽" },
  { t: "Юрист", d: "Семейное право, развод, опека", price: "от 6 000 ₽" },
  { t: "Совместная сессия", d: "Эзотерик + психотерапевт", price: "от 4 500 ₽", soon: true },
];

function formatPrice(n: number): string {
  if (n === 0) return "Бесплатно";
  return n.toLocaleString("ru-RU") + " ₽";
}

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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
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
              Каждый цифровой формат можно купить без подписки. Встречи со специалистами оплачиваются отдельно по полной цене.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2">
            {oneOff.map((item, i) => (
              <div
                key={item.t}
                className="flex items-center justify-between gap-4 py-4"
                style={{
                  borderTop: i > 1 ? "1px solid var(--soft-paper-edge)" : i === 1 ? "none" : "none",
                  borderRight: i % 2 === 0 ? "1px solid var(--soft-paper-edge)" : "none",
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
                Practitioner Pro: {formatPrice(period === "year" ? practitionerPrices.year : practitionerPrices.month)} {period === "year" ? "в год" : "в месяц"} — AI-саммари, контекст по согласию, аналитика.
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
