import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroQuestionInput } from "@/components/landing/hero-question-input";

const topics = [
  "Отношения",
  "Расставание",
  "Работа и призвание",
  "Семья",
  "Самооценка",
  "Тревога",
  "Деньги",
  "Родительство",
  "Дружба",
  "Одиночество",
];

const scenarios = [
  {
    label: "Диалог ясности",
    title: "Начните с вопроса",
    text: "Короткий бережный диалог помогает отделить факты, чувства и предположения.",
  },
  {
    label: "Глубина",
    title: "Углубите ответ",
    text: "Ракурсы, отчет, переписка, совместимость или маршрут «7 дней к ясности».",
  },
  {
    label: "Следующий шаг",
    title: "Выберите опору",
    text: "Если нужен живой человек, специалист появляется после контекста, цены и формата.",
  },
];

export function HeroSection() {
  return (
    <section
      data-testid="v5-home-hero"
      className="soft-hero"
      aria-labelledby="home-hero-title"
    >
      <div className="soft-shell">
        <div className="mx-auto max-w-[58rem] text-center">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
            <span className="soft-badge soft-badge-warm">Бесплатный первый разбор</span>
            <span className="text-sm text-[var(--soft-ink-faint)]">без регистрации до сохранения</span>
          </div>

          <h1 id="home-hero-title" className="soft-display">
            Не всегда первый вопрос — <span className="soft-italic">главный.</span>
          </h1>
          <p className="soft-lede mx-auto mt-6 max-w-2xl">
            Короткий, тёплый диалог помогает добраться до сути: что на самом
            деле тревожит, какие варианты есть и какой ближайший шаг возможен.
          </p>
        </div>

        <div className="soft-halo-stage mt-10">
          <HeroQuestionInput />
        </div>

        <div className="mx-auto mt-6 max-w-3xl text-center">
          <div className="soft-eyebrow mb-4">или выберите тему</div>
          <div className="soft-topic-cloud justify-center">
            {topics.map((topic) => (
              <Link
                key={topic}
                href={`/checkin?question=${encodeURIComponent(`${topic}: `)}`}
                className="soft-chip"
                data-analytics-event="dialogue_topic_clicked"
                data-analytics-target="/checkin"
              >
                {topic}
              </Link>
            ))}
          </div>
        </div>

        <div className="soft-map-grid mt-14">
          {scenarios.map((scenario, index) => (
            <article
              key={scenario.label}
              className="soft-card soft-step-card col-span-12 p-6 md:col-span-4"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="soft-chip soft-chip-warm">{scenario.label}</span>
                <span className="font-heading text-2xl italic text-[var(--soft-terracotta-dark)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="soft-h3 mt-5">{scenario.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {scenario.text}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/products"
            className="soft-button soft-button-ghost"
            data-analytics-event="product_catalog_clicked"
            data-analytics-target="/products"
          >
            Посмотреть все сценарии
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
