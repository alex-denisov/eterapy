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
    benchmarkPattern: "Co-Star берёт точность/данные, CHANI — self-discovery и birth-chart doorway; ETerapy добавляет бережный вывод и понятный следующий шаг.",
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
    previewBullets: ["тон собеседника", "ваши эмоции", "бережные варианты ответа"],
    trustLine: "Приватно — видно только вам. Источник можно удалить после разбора.",
  },
  compatibility: {
    family: "relationship",
    primaryPromise: "Увидите, где вы совпадаете и где разные ритмы.",
    heroVisual: "relationship-map",
    previewTitle: "Карта совместимости",
    previewBullets: ["сильные стороны", "зоны различий", "вопросы для разговора"],
    trustLine: "Ответы партнёра открываются только по согласию.",
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
    previewBullets: ["тип бесплатно", "центры и каналы", "бережный полный разбор"],
    trustLine: "Тип — подсказка к решениям, не ярлык.",
  },
  "surname-story": {
    family: "symbolic",
    primaryPromise: "Узнаете происхождение фамилии и родовую тему.",
    heroVisual: "document-outline",
    previewTitle: "История фамилии",
    previewBullets: ["корень формы", "география", "родовая тема"],
    trustLine: "Фамилия не публикуется без вашего согласия.",
  },
  perspectives: {
    family: "synthesis",
    primaryPromise: "Разложите один вопрос на мысли, чувства и первый шаг.",
    heroVisual: "document-outline",
    previewTitle: "Фрагмент до оплаты",
    previewBullets: ["что видно сейчас", "что может быть скрыто", "первый бережный шаг"],
    trustLine: "Работает от вашего контекста, без публичной публикации.",
  },
  "deep-report": {
    family: "synthesis",
    primaryPromise: "Получите структурный отчёт с выводами и PDF.",
    heroVisual: "document-outline",
    previewTitle: "Оглавление отчёта",
    previewBullets: ["карта ситуации", "риски и возможности", "рекомендации и PDF"],
    trustLine: "Отчёт виден только владельцу.",
  },
};

export function getProductPageSpec(slug: V5ProductSlug): ProductPageSpec {
  return PRODUCT_PAGE_SPECS[slug];
}
