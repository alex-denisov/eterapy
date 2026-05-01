import { PremiumSection } from "@/components/v5/premium";

const steps = [
  {
    number: "01",
    title: "Задайте вопрос",
    description:
      "Начните с живой формулировки ситуации. Регистрация не нужна до момента сохранения или покупки.",
  },
  {
    number: "02",
    title: "Уточните контекст",
    description:
      "Диалог задаёт несколько коротких вопросов, распознаёт сложность и останавливает небезопасные сценарии.",
  },
  {
    number: "03",
    title: "Получите первичный ответ",
    description:
      "Ответ показывает суть запроса, возможные перспективы и бережный следующий шаг без давления.",
  },
  {
    number: "04",
    title: "Выберите глубину",
    description:
      "Можно сохранить ответ, заказать отчёт, пройти маршрут или перейти к рекомендованному специалисту.",
  },
];

export function HowItWorksSection() {
  return (
    <PremiumSection
      className="px-4"
      eyebrow="Как это работает"
      title={
        <>
          От первого вопроса <span className="text-brand-soft-gold">до ясности</span>
        </>
      }
      lead="Четыре спокойных шага: без выбора специалиста на старте и без давления на покупку."
    >
      <ol id="how-it-works" className="relative mx-auto max-w-3xl pl-0">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[2.25rem] top-2 bottom-2 hidden w-px bg-gradient-to-b from-transparent via-brand-soft-gold/35 to-transparent sm:block"
        />
        {steps.map((step, index) => (
          <li
            key={step.number}
            className="group relative grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-2 py-6 sm:gap-x-8"
            style={{
              animation: `landingTimelineRise var(--motion-celebrate) var(--ease-soft) ${index * 90}ms both`,
            }}
          >
            <span className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center font-heading text-3xl italic text-brand-soft-gold/85 sm:h-20 sm:w-20 sm:text-4xl">
              <span
                aria-hidden="true"
                className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,215,154,0.18),transparent_70%)] transition-opacity duration-[var(--motion-base)] ease-[var(--ease-standard)] group-hover:opacity-100"
              />
              <span className="relative">{step.number}</span>
            </span>
            <div className="pt-1.5">
              <h3 className="font-heading text-2xl font-medium leading-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </PremiumSection>
  );
}
