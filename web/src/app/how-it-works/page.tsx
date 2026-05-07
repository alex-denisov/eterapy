import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/how-it-works");

const steps = [
  {
    step: "01",
    title: "Вы пишете своими словами",
    text: "Без формы, категорий и обязательных полей. Можно так, как рассказали бы близкому человеку: путано, эмоционально, с многоточиями.",
  },
  {
    step: "02",
    title: "Мы задаём 2–4 коротких вопроса",
    text: "Чтобы понять контекст: с чем связано, как давно, что уже пробовали, чего хочется на выходе. Любой вопрос можно пропустить.",
  },
  {
    step: "03",
    title: "Получаете первичный разбор",
    text: "Что мы услышали, главная развилка, что обратило внимание (факты / чувства / предположения), безопасный следующий шаг.",
  },
  {
    step: "04",
    title: "Углубляетесь, если хочется",
    text: "4 ракурса, разбор переписки, совместимость, маршрут «7 дней», встреча со специалистом, или совместная сессия — выбираете сами.",
  },
  {
    step: "05",
    title: "Сохраняете в карту",
    text: "Все разборы складываются в личную карту: видны темы, паттерны, повторы. Можно поделиться карточкой, можно удалить всё в один клик.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="how-it-works-page">
      <PublicJsonLd route="/how-it-works" />

      <section className="soft-shell" style={{ paddingTop: 64, paddingBottom: 24, maxWidth: 880, margin: "0 auto" }}>
        <p className="soft-eyebrow">как это работает</p>
        <h1 className="soft-h1 mt-3">
          Тёплый, короткий путь от <span className="soft-italic">«не понимаю, что со мной»</span> к ясному следующему шагу
        </h1>

        {/* Quote card */}
        <div className="soft-card mt-8" style={{ padding: 28 }}>
          <p
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontStyle: "italic",
              fontSize: 24,
              color: "var(--soft-bordeaux)",
              lineHeight: 1.4,
            }}
          >
            «ETerapy — это не предсказание и не терапия. Это пространство, где можно сформулировать важный вопрос — и услышать его в полной тишине».
          </p>
        </div>

        {/* 5 steps */}
        <div className="mt-4 flex flex-col gap-4">
          {steps.map((s) => (
            <div
              key={s.step}
              className="soft-card"
              style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 24, alignItems: "center", padding: 22 }}
            >
              <span
                style={{
                  fontFamily: "var(--font-heading, serif)",
                  fontStyle: "italic",
                  fontSize: 44,
                  color: "var(--soft-terracotta-dark)",
                  lineHeight: 1,
                }}
              >
                {s.step}
              </span>
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-heading, serif)",
                    fontSize: 20,
                    lineHeight: 1.2,
                    color: "var(--soft-bordeaux)",
                    fontWeight: 500,
                    marginBottom: 8,
                  }}
                >
                  {s.title}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                  {s.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Safety card */}
        <div className="soft-card mt-8" style={{ background: "var(--soft-bordeaux)", color: "#F4D9C1", padding: 28 }}>
          <p className="soft-eyebrow" style={{ color: "#F4D9C1", opacity: 0.7 }}>важно</p>
          <h3
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontSize: 20,
              fontWeight: 500,
              color: "#FBF0E1",
              marginTop: 8,
              marginBottom: 12,
            }}
          >
            Когда мы перенаправим к человеку
          </h3>
          <ul style={{ lineHeight: 1.7, paddingLeft: 18, color: "#E8C4B8", fontSize: 14.5 }}>
            <li>Если в разборе появляются мысли о самоповреждении — мы остановимся и дадим контакты экстренных служб.</li>
            <li>Если вопрос про насилие, угрозу безопасности, юридические или медицинские риски — направим к специалисту.</li>
            <li>Если за 2–3 разбора тема не сдвигается — предложим встречу с проверенным психологом, коучем или юристом.</li>
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center" style={{ paddingBottom: 80 }}>
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
        </div>
      </section>
    </main>
  );
}
