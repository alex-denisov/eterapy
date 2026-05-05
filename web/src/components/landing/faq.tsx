"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Чем ETerapy отличается от других платформ?",
    a: "Фиксированная цена за сессию (не поминутная), прозрачная комиссия, бесплатные направления самопознания. Единственная платформа, объединяющая всё это.",
  },
  {
    q: "Вы проверяете «магические способности» практиков?",
    a: "Нет, и мы об этом честно говорим. Мы проверяем личность, этику (тест-консультации) и отслеживаем репутацию через отзывы от оплаченных сессий.",
  },
  {
    q: "Что если практик меня напугал или давит на покупку?",
    a: "Оставьте жалобу — мы разберём её по логам сессии. Если практик нарушил этический кодекс, вы получите возврат из его ближайшей выплаты.",
  },
  {
    q: "Как устроена оплата?",
    a: "Фиксированная цена видна до бронирования. Оплата через защищённую кассу. Деньги удерживаются до завершения сессии.",
  },
  {
    q: "Что такое направления самопознания?",
    a: "Бесплатные направления на платформе: расклад Таро с интерпретацией, нумерологический расчёт, рефлексивные вопросы. 3 сессии в месяц бесплатно.",
  },
  {
    q: "Могу ли я работать на ETerapy и на других площадках?",
    a: "Да. Мы не ограничиваем параллельную работу. ETerapy — дополнительный канал, а не эксклюзивный контракт.",
  },
  {
    q: "Это медицинский или психологический сервис?",
    a: "Нет. Все услуги на ETerapy носят развлекательный и ознакомительный характер. Консультации практиков не заменяют профессиональную помощь врачей, психологов или юристов.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="soft-shell-narrow py-16 md:py-24">
      <div className="text-center">
        <div className="soft-eyebrow">faq</div>
        <h2 className="soft-h1 mt-3">Частые вопросы</h2>
      </div>

      <div className="soft-card mt-10 divide-y divide-[var(--soft-paper-edge)] overflow-hidden">
        {faqs.map((faq, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="flex min-h-14 w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--soft-paper-deep)]"
            >
              <span className="pr-4 font-medium text-[var(--soft-ink)]">{faq.q}</span>
              <span className="shrink-0 text-xl text-[var(--soft-terracotta-dark)]">
                {openIndex === i ? "−" : "+"}
              </span>
            </button>
            {openIndex === i && (
              <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--soft-ink-soft)] animate-in fade-in slide-in-from-top-1 duration-200">
                {faq.a}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
