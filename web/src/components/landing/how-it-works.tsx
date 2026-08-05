import Link from "next/link";
import { ArrowRight, Compass, Sparkles, Waypoints } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Опишите своими словами",
    description: "Без формы и категорий. Так, как рассказали бы близкому человеку за кофе.",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Несколько уточнений",
    description: "Мы задаём 2–4 коротких вопроса, чтобы понять контекст. Можно пропустить.",
    icon: Waypoints,
  },
  {
    number: "03",
    title: "Понять, что дальше",
    description: "Что мы услышали, главная развилка, безопасный шаг — и углубление, если захотите.",
    icon: Compass,
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="soft-shell py-12 md:py-20">
      <div className="mb-6 text-center md:mb-10">
        <div className="soft-eyebrow">Как это работает</div>
        <h2 className="soft-h1 mt-3 mx-auto max-w-3xl">
          От вопроса <span className="soft-italic">к ответу</span> — за 5–7 минут
        </h2>
      </div>

      <ol className="soft-map-grid">
        {steps.map((step) => (
          <li key={step.number} className="soft-card soft-step-card col-span-12 p-5 md:col-span-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="font-heading text-2xl italic text-[var(--soft-terracotta-dark)]">
                {step.number}
              </span>
              <step.icon className="size-5 text-[var(--soft-ink-faint)]" aria-hidden="true" />
            </div>
            <h3 className="soft-h3 mt-3">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {step.description}
            </p>
          </li>
        ))}
      </ol>

      {/* B657: одна строка, а не блок — главная намеренно держится в шести
          экранах (B374/B595). Ссылка ведёт на страницу, которая объясняет
          формат словами живого запроса и несёт единственный работающий
          поисковый кластер сайта. */}
      <p className="mt-6 text-center text-sm">
        <Link
          href="/ai-psychologist"
          className="inline-flex items-center gap-1.5 text-[var(--soft-bordeaux)] underline-offset-4 hover:underline"
          data-testid="home-ai-psychologist-link"
        >
          Что такое ИИ-психолог и чем он не заменяет специалиста
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}
