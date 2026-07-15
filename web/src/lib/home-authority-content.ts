import { canonicalUrl, seoOrigins } from "@/lib/seo";

export const HOME_CONTENT_PUBLISHED_AT = "2026-07-15";
export const HOME_CONTENT_REVIEWED_AT = "2026-07-15";

export const HOME_FAQS = [
  {
    question: "Что такое ETerapy?",
    answer: "ETerapy — диалоговая платформа для ясности в жизненных вопросах. Она помогает сформулировать запрос, отделить факты от предположений, получить первичный разбор и выбрать безопасный следующий шаг.",
  },
  {
    question: "Чем первичный разбор отличается от консультации психолога?",
    answer: "Первичный разбор — информационная рефлексия, а не диагностика, лечение или психотерапия. Он помогает упорядочить ситуацию. Для устойчивых симптомов, кризиса или работы с психическим здоровьем нужен профильный специалист.",
  },
  {
    question: "С какого вопроса можно начать?",
    answer: "Подойдёт конкретный жизненный вопрос: менять ли работу, как подготовиться к разговору, почему повторяется конфликт или чего вы хотите от отношений. Можно написать его свободно, без выбора категории.",
  },
  {
    question: "Нужно ли регистрироваться и платить заранее?",
    answer: "Нет. Первый разбор можно начать без регистрации и оплаты. Сохранение истории, цифровые углубления и встречи со специалистами предлагаются отдельно, с ценой до подтверждения покупки.",
  },
  {
    question: "Как ETerapy использует искусственный интеллект?",
    answer: "Часть первичных разборов формируется с помощью ИИ по правилам безопасности платформы. ИИ структурирует текст и предлагает разные точки зрения, но не ставит диагноз, не гарантирует результат и не принимает решение за человека.",
  },
  {
    question: "Когда цифрового разбора недостаточно?",
    answer: "Обратитесь к человеку при угрозе жизни или безопасности, медицинских симптомах, насилии, сложном юридическом или финансовом решении, а также когда тема повторяется и самостоятельная рефлексия не помогает двигаться дальше.",
  },
  {
    question: "Как выбираются специалисты?",
    answer: "Платформа проверяет профиль и документы, показывает цену до записи и собирает отзывы после оплаченных сессий. Пользователь сам выбирает специалиста и может обратиться в поддержку или подать жалобу из кабинета.",
  },
  {
    question: "Что происходит с вопросом и результатом?",
    answer: "Гостевой вопрос используется для текущего диалога. После регистрации результаты можно сохранить в личном кабинете, скрыть или удалить. Подробные правила описаны в политике конфиденциальности.",
  },
] as const;

const organization = {
  "@type": "Organization",
  "@id": `${seoOrigins.main}/#organization`,
  name: "ETerapy",
  url: seoOrigins.main,
  logo: {
    "@type": "ImageObject",
    url: canonicalUrl("/icon.svg"),
  },
};

export function homeAuthorityJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": `${seoOrigins.main}/#how-eterapy-works-article`,
      headline: "ETerapy: как устроен разбор жизненного вопроса",
      description: "Определения, примеры, ограничения и критерии выбора между самостоятельным разбором, цифровым углублением и живым специалистом.",
      image: canonicalUrl("/clarity-flow.svg"),
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl("/") },
      author: organization,
      publisher: organization,
      datePublished: HOME_CONTENT_PUBLISHED_AT,
      dateModified: HOME_CONTENT_REVIEWED_AT,
      inLanguage: "ru-RU",
      articleSection: ["Саморефлексия", "Принятие решений", "Безопасность"],
      about: [
        { "@type": "Thing", name: "Саморефлексия" },
        { "@type": "Thing", name: "Принятие решений" },
        { "@type": "Service", name: "Диалог ясности", provider: organization },
      ],
      citation: [
        "https://www.who.int/ru/news-room/fact-sheets/detail/self-care-health-interventions",
        "https://76.mchs.gov.ru/deyatelnost/poleznaya-informaciya/rekomendacii-naseleniyu/sistema-112",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${seoOrigins.main}/#faq`,
      mainEntity: HOME_FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ];
}
