import { PremiumCard, PremiumSection } from "@/components/v5/premium";

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
      "Диалог задает несколько коротких вопросов, распознает сложность и останавливает небезопасные сценарии.",
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
      "Можно сохранить ответ, заказать отчет, пройти маршрут или перейти к рекомендованному специалисту.",
  },
];

export function HowItWorksSection() {
  return (
    <PremiumSection
      className="px-4"
      eyebrow="Как это работает"
      title={<>От первого вопроса <span className="text-brand-soft-gold">до ясности</span></>}
      lead="Четыре спокойных шага: без выбора специалиста на старте и без давления на покупку."
    >
      <div id="how-it-works" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <PremiumCard key={step.number} className="group min-h-56">
            <div className="font-heading text-4xl font-medium italic text-brand-soft-gold/75 transition-colors group-hover:text-brand-soft-gold">
              {step.number}
            </div>
            <h3 className="mt-5 font-heading text-2xl font-medium">{step.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </PremiumCard>
        ))}
      </div>
    </PremiumSection>
  );
}
