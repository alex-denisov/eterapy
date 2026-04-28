export type V5ProductSlug =
  | "primary-answer"
  | "perspectives"
  | "deep-report"
  | "chat-analysis"
  | "compatibility"
  | "seven-days"
  | "my-map";

type ProductTone = "free" | "paid" | "route" | "private";

export type V5Product = {
  slug: V5ProductSlug;
  route: `/products/${V5ProductSlug}`;
  name: string;
  eyebrow: string;
  summary: string;
  price: string;
  tone: ProductTone;
  cta: string;
  mechanics: string[];
  privacy: string;
  result: string;
};

export const v5Products: V5Product[] = [
  {
    slug: "primary-answer",
    route: "/products/primary-answer",
    name: "Первичный ответ",
    eyebrow: "Free activation",
    summary: "Короткий уточняющий диалог и структурированное отражение ситуации без оплаты на старте.",
    price: "0 ₽",
    tone: "free",
    cta: "Получить первый ответ",
    mechanics: ["2-5 уточнений", "skip state", "safety interrupt", "registration after value moment"],
    privacy: "Гость работает в анонимной сессии; сохранение результата требует регистрации.",
    result: "Краткое понимание запроса, 3-7 вариантов углубления и безопасный следующий шаг.",
  },
  {
    slug: "perspectives",
    route: "/products/perspectives",
    name: "4 ракурса ответа",
    eyebrow: "Fast paid unlock",
    summary: "Один вопрос раскрывается через рациональный, эмоциональный, символический и практический ракурс.",
    price: "299 ₽",
    tone: "paid",
    cta: "Углубить ответ",
    mechanics: ["рациональный ракурс", "эмоциональный ракурс", "символический без фатальности", "практические действия"],
    privacy: "Работает от контекста диалога; приватные данные не публикуются.",
    result: "Четыре перспективы и итог, который можно сохранить в My Map.",
  },
  {
    slug: "deep-report",
    route: "/products/deep-report",
    name: "Глубокий отчет",
    eyebrow: "Main report",
    summary: "Развернутый отчет по ситуации на основе диалога, доступный после оплаты или по подписке.",
    price: "490-990 ₽",
    tone: "paid",
    cta: "Посмотреть глубину",
    mechanics: ["preview gate", "entitlement unlock", "save to My Map", "export/delete"],
    privacy: "Отчет виден только владельцу; удаление доступно там, где это юридически допустимо.",
    result: "Структура ситуации, риски, возможности, рекомендации и опциональный экспорт.",
  },
  {
    slug: "chat-analysis",
    route: "/products/chat-analysis",
    name: "Разбор переписки",
    eyebrow: "Conversation analysis",
    summary: "Анализ текста или скрина переписки с предупреждением о персональных данных до загрузки.",
    price: "299-1490 ₽",
    tone: "private",
    cta: "Разобрать переписку",
    mechanics: ["paste/upload", "PII warning", "source deletion", "answer variants in Pro"],
    privacy: "Пользователь подтверждает право использовать переписку и может удалить исходник.",
    result: "Наблюдения по динамике общения, границам и возможным формулировкам ответа.",
  },
  {
    slug: "compatibility",
    route: "/products/compatibility",
    name: "Совместимость",
    eyebrow: "Partner consent",
    summary: "Парный отчет, который открывается только после согласия и завершения обеих сторон.",
    price: "590-990 ₽",
    tone: "paid",
    cta: "Создать совместимость",
    mechanics: ["invite link", "partner consent", "teaser", "paid full report"],
    privacy: "Автор не видит приватные ответы партнера до завершения и разрешенного результата.",
    result: "Общие паттерны, точки напряжения, точки поддержки и практичные темы для разговора.",
  },
  {
    slug: "seven-days",
    route: "/products/seven-days",
    name: "7 дней к ясности",
    eyebrow: "Retention route",
    summary: "Маршрут из коротких ежедневных шагов по 5-10 минут с итоговым отчетом.",
    price: "790-1490 ₽",
    tone: "route",
    cta: "Начать день 1",
    mechanics: ["day status", "pause/resume", "reminders", "final report"],
    privacy: "Напоминания работают только по выбранным каналам и preference center.",
    result: "Семь дневных шагов, мягкий прогресс и финальный отчет по вопросу.",
  },
  {
    slug: "my-map",
    route: "/products/my-map",
    name: "Моя карта ETerapy",
    eyebrow: "Personal retention",
    summary: "Личное пространство, где сохраняются вопросы, ответы, отчеты, маршруты и значимые выводы.",
    price: "в подписке или 990-2990 ₽",
    tone: "private",
    cta: "Сохранить в карту",
    mechanics: ["save/hide/delete", "export", "share fragment", "daily card"],
    privacy: "Карта приватна по умолчанию и не содержит медицинских диагнозов.",
    result: "Накопленная личная карта тем, решений и повторяющихся паттернов.",
  },
];

export function getV5Product(slug: string): V5Product | undefined {
  return v5Products.find((product) => product.slug === slug);
}
