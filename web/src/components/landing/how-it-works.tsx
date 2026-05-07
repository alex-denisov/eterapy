import { Compass, Leaf, Sparkles, Waypoints } from "lucide-react";

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
    description: "Мы задаём 2-4 коротких вопроса, чтобы понять контекст. Можно пропустить.",
    icon: Waypoints,
  },
  {
    number: "03",
    title: "Первичный разбор",
    description: "Что мы услышали, главная развилка, на что обратить внимание, безопасный шаг.",
    icon: Compass,
  },
  {
    number: "04",
    title: "Углубление по выбору",
    description: "Ракурсы, разбор переписки, совместимость, маршрут или встреча со специалистом.",
    icon: Leaf,
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="soft-shell py-16 md:py-24">
      <div className="mb-8 flex flex-col justify-between gap-6 md:mb-12 md:flex-row md:items-center">
        <div>
          <div className="soft-eyebrow">Как это работает</div>
          <h2 className="soft-h1 mt-3 max-w-2xl">
            Четыре шага от вопроса <span className="soft-italic">к ясности</span>
          </h2>
        </div>
        <div className="inline-flex w-fit rotate-[-1.5deg] rounded-md border border-[#eed9a1] bg-[#fff6d6] px-3 py-1 font-heading text-xl italic text-[#6b4a1e] shadow-[0_2px_0_rgba(0,0,0,0.04)]">
          5-7 минут
        </div>
      </div>

      <ol className="soft-map-grid">
        {steps.map((step) => (
          <li key={step.number} className="soft-card soft-step-card col-span-12 p-6 md:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <span className="font-heading text-2xl italic text-[var(--soft-terracotta-dark)]">
                {step.number}
              </span>
              <step.icon className="size-6 text-[var(--soft-ink-faint)]" aria-hidden="true" />
            </div>
            <h3 className="soft-h3 mt-5">{step.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
