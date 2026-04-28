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
    <section id="how-it-works" className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-center text-3xl font-bold md:text-4xl">
          Как это работает
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          От первого вопроса до осмысленного действия — 4 спокойных шага
        </p>

        <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div key={step.number} className="group relative">
              <div className="mb-4 font-heading text-4xl font-bold text-primary/20 transition-colors group-hover:text-primary/40">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
