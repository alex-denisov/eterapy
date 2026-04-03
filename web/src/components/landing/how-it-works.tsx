const steps = [
  {
    number: "01",
    title: "Попробуй инструменты",
    description:
      "Бесплатный расклад Таро, нумерологический расчёт или рефлексивные вопросы — прямо сейчас, без регистрации.",
  },
  {
    number: "02",
    title: "Найди практика",
    description:
      "Каталог верифицированных специалистов с реальными отзывами от оплаченных сессий.",
  },
  {
    number: "03",
    title: "Запишись по фиксированной цене",
    description:
      "Никакой поминутной оплаты. Цена видна заранее. Оплата через защищённую кассу.",
  },
  {
    number: "04",
    title: "Проведи сессию",
    description:
      "Видеочат с практиком прямо на платформе. Запись по согласию. Возврат при нарушениях.",
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
          От первого знакомства до живой сессии — 4 простых шага
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
