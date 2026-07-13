import type { V5ProductSlug } from "@/lib/v5-products";

export type ProductPageFamily = "symbolic" | "relationship" | "synthesis";
export type ProductHeroVisual = "interactive-chart" | "relationship-map" | "document-outline" | "conversation-scan";

export type ProductPageFamilySpec = {
  family: ProductPageFamily;
  label: string;
  aboveFoldRule: string;
  benchmarkPattern: string;
  previewPrinciple: string;
};

export type ProductPageSpec = {
  family: ProductPageFamily;
  primaryPromise: string;
  heroVisual: ProductHeroVisual;
  previewTitle: string;
  previewBullets: string[];
  trustLine: string;
};

export const PRODUCT_PAGE_FAMILY_SPECS: Record<ProductPageFamily, ProductPageFamilySpec> = {
  symbolic: {
    family: "symbolic",
    label: "Символические продукты",
    aboveFoldRule: "На первом экране: что узнаю, цена, один primary CTA, живой символический preview без фатализма.",
    benchmarkPattern: "Co-Star берёт точность/данные, CHANI — self-discovery и birth-chart doorway; ETerapy добавляет ясную интерпретацию и понятный следующий шаг.",
    previewPrinciple: "Показывать карту, расклад, бодиграф или родовую карточку как рабочий артефакт, а не декоративную иллюстрацию.",
  },
  relationship: {
    family: "relationship",
    label: "Отношения и двое",
    aboveFoldRule: "На первом экране: какую динамику увидим, цена/начало бесплатно, один primary CTA, приватность согласия.",
    benchmarkPattern: "The Pattern продаёт глубину personality/relationship patterns, Sanctuary — доверие и живых экспертов; ETerapy делает безопасное согласие и общий разговорный итог.",
    previewPrinciple: "Показывать карту взаимодействия: две стороны, зона совпадения, зона напряжения и следующий разговор.",
  },
  synthesis: {
    family: "synthesis",
    label: "Синтез вопроса",
    aboveFoldRule: "На первом экране: какой итог получу, цена, один primary CTA, структура результата до оплаты.",
    benchmarkPattern: "Лучшие SaaS-страницы отвечают за 3 секунды: что это, зачем мне, что сделать; ETerapy делает это в формате инструмента, не рекламного лендинга.",
    previewPrinciple: "Показывать оглавление, фрагмент или схему будущего отчёта так, чтобы глубина была ясна до оплаты.",
  },
};

export const PRODUCT_PAGE_SPECS: Record<V5ProductSlug, ProductPageSpec> = {
  "chat-analysis": {
    family: "relationship",
    primaryPromise: "Поймёте тон переписки и получите варианты ответа.",
    heroVisual: "conversation-scan",
    previewTitle: "Что увидите в разборе",
    previewBullets: ["тон собеседника", "ваши эмоции", "варианты ответа"],
    trustLine: "Приватно — видно только вам. Источник можно удалить после разбора.",
  },
  pair: {
    family: "relationship",
    primaryPromise: "Соберёте несколько взглядов на один общий вопрос.",
    heroVisual: "relationship-map",
    previewTitle: "Один вопрос, несколько сторон",
    previewBullets: ["ваша сторона", "взгляд близкого", "общий безопасный итог"],
    trustLine: "Гость может ответить по ссылке без регистрации.",
  },
  synastry: {
    family: "relationship",
    primaryPromise: "Сравните две карты как язык динамики пары.",
    heroVisual: "interactive-chart",
    previewTitle: "Две карты рядом",
    previewBullets: ["где легче совпасть", "где разные ритмы", "какой разговор поможет"],
    trustLine: "Данные рождения остаются приватными.",
  },
  tarot: {
    family: "symbolic",
    primaryPromise: "Посмотрите на вопрос через три символические карты.",
    heroVisual: "interactive-chart",
    previewTitle: "Расклад без приговора",
    previewBullets: ["образ ситуации", "скрытая развилка", "практичный следующий шаг"],
    trustLine: "Карты помогают думать, а не предсказывают судьбу.",
  },
  "natal-chart": {
    family: "symbolic",
    primaryPromise: "Увидите карту тем рождения и зону роста сейчас.",
    heroVisual: "interactive-chart",
    previewTitle: "Живая карта на первом экране",
    previewBullets: ["Солнце и асцендент", "ключевые акценты", "связь с вашим вопросом"],
    trustLine: "Данные рождения используются только для выбранного разбора.",
  },
  horary: {
    family: "symbolic",
    primaryPromise: "Получите прямой ответ на один вопрос по карте зафиксированного момента.",
    heroVisual: "interactive-chart",
    previewTitle: "Астрология вопросов",
    previewBullets: ["сигнификаторы", "препятствия и рецепции", "ответ, срок и условие"],
    trustLine: "Момент фиксируется на сервере; новая формулировка создаёт новую карту.",
  },
  "tarot-numerology": {
    family: "symbolic",
    primaryPromise: "Узнайте постоянные Старшие арканы своей даты рождения.",
    heroVisual: "interactive-chart",
    previewTitle: "Арканы рождения",
    previewBullets: ["карта рождения", "карта души", "связь двух арканов"],
    trustLine: "Арканы рассчитываются по видимой формуле — случайной вытяжки нет.",
  },
  numerology: {
    family: "symbolic",
    primaryPromise: "Соберёте короткую схему личных тем и ритмов.",
    heroVisual: "document-outline",
    previewTitle: "Числа как схема",
    previewBullets: ["сильные стороны", "повторяющиеся уроки", "цикл года"],
    trustLine: "Это язык самонаблюдения, не обещание событий.",
  },
  "family-scenarios": {
    family: "symbolic",
    primaryPromise: "Увидите семейные повторы, которые можно мягко прервать.",
    heroVisual: "document-outline",
    previewTitle: "Карта повторов рода",
    previewBullets: ["семейные роли", "негласные правила", "что уже можно не нести"],
    trustLine: "Родовые истории остаются приватными.",
  },
  "human-design": {
    family: "symbolic",
    primaryPromise: "Узнаете тип, стратегию и бодиграф по данным рождения.",
    heroVisual: "interactive-chart",
    previewTitle: "Бодиграф как рабочая схема",
    previewBullets: ["тип и стратегия", "центры и каналы", "полный разбор"],
    trustLine: "Тип — подсказка к решениям, не ярлык.",
  },
  "surname-story": {
    family: "symbolic",
    primaryPromise: "Раскроете происхождение, звучание и символический образ имени и фамилии.",
    heroVisual: "interactive-chart",
    previewTitle: "Личное досье имени",
    previewBullets: ["проверяемое происхождение", "звучание и латиница", "символические черты характера"],
    trustLine: "Фамилия не публикуется без вашего согласия.",
  },
  reframe: {
    family: "synthesis",
    primaryPromise: "Увидьте ситуацию иначе: мысли, чувства, другой взгляд и шаг.",
    heroVisual: "document-outline",
    previewTitle: "Четыре угла под ваш запрос",
    previewBullets: ["что я себе говорю", "что подсказывает чувство", "другой, более честный взгляд"],
    trustLine: "Работает от вашего контекста, без публичной публикации.",
  },
  "deep-report": {
    family: "synthesis",
    primaryPromise: "Получите структурный разбор-документ с выводами, развилками и планом действий.",
    heroVisual: "document-outline",
    previewTitle: "Структурный документ-разбор",
    previewBullets: ["карта ситуации", "что удерживает и опоры", "сценарии и маршрут шагов"],
    trustLine: "Разбор виден только владельцу, PDF — в кабинете.",
  },
};

export function getProductPageSpec(slug: V5ProductSlug): ProductPageSpec {
  return PRODUCT_PAGE_SPECS[slug];
}
