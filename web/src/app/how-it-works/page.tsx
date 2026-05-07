import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/how-it-works");

const steps = [
  {
    step: "01",
    title: "Опишите своими словами",
    text: "Без формы и категорий. Так, как рассказали бы близкому человеку за кофе.",
  },
  {
    step: "02",
    title: "Несколько уточнений",
    text: "Мы задаём 2–4 коротких вопроса, чтобы понять контекст. Можно пропустить.",
  },
  {
    step: "03",
    title: "Первичный разбор",
    text: "Что мы услышали, главная развилка, на что обратить внимание, безопасный шаг.",
  },
  {
    step: "04",
    title: "Углубление по выбору",
    text: "Ракурсы, разбор переписки, совместимость, маршрут или встреча со специалистом.",
  },
];

const helps = [
  "сформулировать вопрос, когда трудно подобрать слова",
  "посмотреть на ситуацию с разных сторон",
  "отделить факты от чувств и предположений",
  "увидеть один безопасный следующий шаг",
  "сохранить инсайты в личной карте",
  "при необходимости найти специалиста",
];

const notHelps = [
  "предсказать будущее как факт",
  "вернуть человека, который уходит",
  "поставить диагноз или вылечить",
  "заменить психолога, врача или юриста",
  "принять решение за вас",
  "гарантировать конкретный результат",
];

export default function HowItWorksPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="how-it-works-page">
      <PublicJsonLd route="/how-it-works" />

      {/* Hero */}
      <section className="soft-shell" style={{ paddingTop: 64, paddingBottom: 24 }}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div style={{ maxWidth: 680 }}>
            <p className="soft-eyebrow">как это работает</p>
            <h1 className="soft-h1 mt-3">
              Четыре шага от вопроса <span className="soft-italic">к ясности</span>
            </h1>
          </div>
          <span
            aria-label="Занимает 5–7 минут"
            style={{
              display: "inline-block",
              background: "#FFF6D6",
              border: "1px solid #EED9A1",
              padding: "6px 14px",
              fontFamily: "var(--font-heading, serif)",
              fontStyle: "italic",
              fontSize: 18,
              color: "#6B4A1E",
              borderRadius: 4,
              transform: "rotate(-1.5deg)",
              boxShadow: "0 2px 0 rgba(0,0,0,.04)",
              flexShrink: 0,
            }}
          >
            5–7 минут
          </span>
        </div>

        {/* Steps grid */}
        <div className="soft-map-grid" style={{ marginTop: 8 }}>
          {steps.map((s) => (
            <div
              key={s.step}
              className="soft-card"
              style={{ gridColumn: "span 3", padding: 22 }}
            >
              <span
                style={{
                  fontFamily: "var(--font-heading, serif)",
                  fontStyle: "italic",
                  color: "var(--soft-terracotta-dark)",
                  fontSize: 22,
                  display: "block",
                  marginBottom: 14,
                }}
              >
                {s.step}
              </span>
              <p
                style={{
                  fontFamily: "var(--font-heading, serif)",
                  fontSize: 22,
                  lineHeight: 1.2,
                  color: "var(--soft-bordeaux)",
                  fontWeight: 500,
                  marginBottom: 10,
                }}
              >
                {s.title}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Help vs not help */}
      <section className="soft-shell" style={{ marginTop: 64 }}>
        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="soft-card"
            style={{ background: "linear-gradient(150deg, #FFFCF5, #F4D9C1)", padding: 28 }}
          >
            <p className="soft-eyebrow">мы помогаем</p>
            <h2 className="soft-h3 mt-3" style={{ marginBottom: 20 }}>
              сформулировать, услышать, увидеть варианты
            </h2>
            <div className="flex flex-col gap-3">
              {helps.map((x) => (
                <div key={x} className="flex items-start gap-3">
                  <span
                    style={{
                      color: "var(--soft-terracotta-dark)",
                      fontSize: 16,
                      lineHeight: 1.5,
                      flexShrink: 0,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ fontSize: 15 }}>{x}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="soft-card-flat" style={{ padding: 28 }}>
            <p className="soft-eyebrow">мы не обещаем</p>
            <h2 className="soft-h3 mt-3" style={{ marginBottom: 20 }}>
              того, чего никто честно обещать не может
            </h2>
            <div className="flex flex-col gap-3">
              {notHelps.map((x) => (
                <div key={x} className="flex items-start gap-3">
                  <span
                    style={{
                      color: "var(--soft-ink-faint)",
                      fontSize: 16,
                      lineHeight: 1.5,
                      flexShrink: 0,
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </span>
                  <span style={{ fontSize: 15, color: "var(--soft-ink-soft)" }}>{x}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="soft-shell" style={{ marginTop: 64, paddingBottom: 80 }}>
        <div className="soft-card soft-form-panel" style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <p className="soft-eyebrow">первый разбор бесплатно</p>
          <h2 className="soft-h2 mt-3">С чего начнём?</h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            Без регистрации. Анонимно. Занимает 5–7 минут.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <Link
              href="/checkin"
              className="soft-button soft-button-primary"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/checkin"
              data-testid="how-it-works-dialogue-cta"
            >
              Начать диалог
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/practitioners" className="soft-button soft-button-ghost">
              Найти специалиста
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
