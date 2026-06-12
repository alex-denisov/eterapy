import {
  V5_PRODUCT_PRICES_KOPECKS,
  V5_PRODUCT_CREDIT_COSTS,
  formatRubFromKopecks,
} from "@/lib/product-prices";

export type V5ProductSlug =
  | "clarity-practice"
  | "perspectives"
  | "deep-report"
  | "chat-analysis"
  | "compatibility"
  | "pair"
  | "seven-days"
  | "my-map"
  | "tarot"
  | "natal-chart"
  | "synastry"
  | "numerology";

type ProductTone = "free" | "paid" | "route" | "private";

export type V5Product = {
  slug: V5ProductSlug;
  route: `/products/${V5ProductSlug}`;
  name: string;
  eyebrow: string;
  summary: string;
  price: string;
  priceMeta: string;
  creditPrice: string | null;
  creditCost: number | null;
  tone: ProductTone;
  cta: string;
  directCta?: string;
  directHref?: string;
  productKey?: string;
  mechanics: string[];
  privacy: string;
  result: string;
};

// B366: the `price`/`creditCost` literals below are placeholders — the real
// values are injected from entitlements (V5_PRODUCT_PRICES_KOPECKS /
// V5_PRODUCT_CREDIT_COSTS) by the derive step at the bottom of this file, so the
// catalog can never drift from the billing source of truth.
const RAW_V5_PRODUCTS: V5Product[] = [
  {
    slug: "clarity-practice",
    route: "/products/clarity-practice",
    name: "Ежедневная практика",
    eyebrow: "Ежедневный ритм",
    summary: "Один короткий вопрос, один мягкий взгляд со стороны и один маленький шаг в день. Формат помогает возвращаться к себе без длинной сессии.",
    price: "0 ₽",
    priceMeta: "расширение — от 299 ₽ или за баллы",
    creditPrice: "расширение — от 299 ₽ или за баллы",
    creditCost: null,
    tone: "free",
    cta: "Сегодняшний вопрос",
    directCta: "Открыть практику в кабинете",
    // B306: renamed cabinet URL from /modalities → /practice for
    // semantic clarity (modalities was the legacy name for many tools,
    // but only the daily clarity-practice lives here now). The proxy
    // rewrites app.eterapy.com/practice → /cabinet/practice;
    // /cabinet/modalities still works as a legacy redirect.
    directHref: "https://app.eterapy.com/practice",
    mechanics: ["один вопрос в день", "короткий взгляд дня", "мягкие напоминания", "баллы за осмысленное действие"],
    privacy: "Напоминания и сохранение работают только по выбранным пользователем каналам.",
    result: "Ежедневная привычка, которая пополняет личную карту без давления и публичности.",
  },
  {
    slug: "perspectives",
    route: "/products/perspectives",
    name: "Полная картина",
    eyebrow: "углубление",
    summary: "Один вопрос целиком: мысли, чувства, скрытый смысл и первый шаг. Первая часть разбора бесплатно.",
    // B322: aligned with docs/ETerapy_v5_Product_Package/13_Prices_Breakdown.md §5 —
    // 299 ₽ или 1 балл (was 2).
    price: "299 ₽",
    priceMeta: "или −1 балл",
    creditPrice: "или −1 балл",
    creditCost: 1,
    tone: "paid",
    cta: "Увидеть полную картину",
    directCta: "Открыть полную картину",
    productKey: "perspectives",
    mechanics: ["мысли", "чувства", "скрытый смысл без фатальности", "первый шаг"],
    privacy: "Работает от контекста диалога; приватные данные не публикуются.",
    result: "Ситуация целиком — с четырёх сторон — и итог, который можно сохранить в Моей карте.",
  },
  {
    slug: "deep-report",
    route: "/products/deep-report",
    name: "Подробный разбор",
    eyebrow: "углубление · документ-разбор",
    summary: "Полноценный разбор-документ на 10–15 страниц. С оглавлением, выводами и рекомендациями. Можно скачать PDF, сохранить в Мою карту, обсудить со специалистом.",
    // B366: 890 ₽ / 3 балла (≈297 ₽/балл, выровненная лестница). В Premium входит.
    price: "890 ₽",
    priceMeta: "или −3 балла · в Premium входит",
    creditPrice: "или −3 балла · в Premium входит",
    creditCost: 3,
    tone: "paid",
    cta: "Посмотреть глубину",
    directCta: "Начать разбор",
    productKey: "deep-report",
    mechanics: ["оглавление до оплаты", "предпросмотр одного блока", "открытие через entitlement", "сохранение в Мою карту", "PDF export"],
    privacy: "Отчет виден только владельцу; удаление доступно там, где это юридически допустимо.",
    result: "Структура ситуации, риски, возможности, рекомендации и опциональный экспорт.",
  },
  {
    slug: "chat-analysis",
    route: "/products/chat-analysis",
    name: "Разбор переписки",
    eyebrow: "Приватный анализ",
    summary: "Анализ текста или скриншота переписки: тон, эмоции, границы и бережные варианты ответа.",
    // B366: single price 590 ₽ / 2 балла (295 ₽/балл).
    price: "590 ₽",
    priceMeta: "разовый разбор · или −2 балла",
    creditPrice: "или −2 балла",
    creditCost: 2,
    tone: "private",
    cta: "Разобрать переписку",
    directCta: "Разобрать переписку",
    productKey: "chat-analysis",
    mechanics: ["вставка или загрузка", "распознавание текста до оплаты", "удаление источника", "варианты ответа"],
    privacy: "Источник переписки можно удалить в любой момент после генерации разбора.",
    result: "Наблюдения по динамике общения, границам и возможным формулировкам ответа.",
  },
  {
    slug: "compatibility",
    route: "/products/compatibility",
    name: "Совместимость",
    eyebrow: "Согласие партнёра · начало бесплатно",
    // G3: compatibility = насколько двое совпадают в целом (сильные стороны
    // взаимодействия и зоны различий), в отличие от «Разобраться вдвоём»,
    // который решает один конкретный общий вопрос.
    summary: "Парный отчёт о том, насколько вы совпадаете: сильные стороны взаимодействия и зоны различий — открывается после согласия обоих.",
    // B366: 890 ₽ / 3 балла (≈297 ₽/балл). Начало бесплатно.
    price: "890 ₽",
    priceMeta: "один отчёт на двоих · начало бесплатно",
    creditPrice: "от −3 баллов",
    creditCost: 3,
    tone: "free",
    cta: "Создать совместимость",
    directCta: "Создать совместимость",
    productKey: "compatibility",
    mechanics: ["ссылка-приглашение", "согласие партнёра", "бесплатное начало", "платный полный отчёт"],
    privacy: "Автор не видит приватные ответы партнёра до завершения и разрешенного результата.",
    result: "Сильные стороны взаимодействия, зоны различий и тёплые темы для разговора.",
  },
  {
    slug: "seven-days",
    route: "/products/seven-days",
    name: "Маршрут 7 дней",
    eyebrow: "Маршрут · день 1 бесплатно",
    summary: "Маршрут из коротких ежедневных шагов по 5-10 минут с итоговым отчетом.",
    // B322: docs §11 — день 1 бесплатно, полный маршрут 990 ₽. Tone "free"
    // чтобы отражать бесплатный первый день.
    price: "990 ₽",
    priceMeta: "или −8 баллов · день 1 бесплатно",
    creditPrice: "или −8 баллов",
    creditCost: 8,
    tone: "free",
    cta: "Начать день 1 бесплатно",
    directCta: "Начать маршрут",
    productKey: "seven-days",
    mechanics: ["статус дня", "пауза и продолжение", "напоминания", "итоговый отчет"],
    privacy: "Напоминания работают только по выбранным каналам и preference center.",
    result: "Семь дневных шагов, мягкий прогресс и финальный отчет по вопросу.",
  },
  {
    // B385: «Вместе» объединяет три сценария (взгляд со стороны / сверить
    // взгляды / совместимость). Старый «Круг» закрыт и слит сюда.
    slug: "pair",
    route: "/products/pair",
    name: "Вместе",
    eyebrow: "Три сценария · начало бесплатно",
    summary: "Один вопрос — несколько взглядов: позвать близкого за свежим взглядом по ссылке (без регистрации), сверить взгляды по согласию или посмотреть на совместимость.",
    // B366: 890 ₽ / 3 балла (≈297 ₽/балл). Начало бесплатно.
    price: "890 ₽",
    priceMeta: "полный разбор · начало бесплатно",
    creditPrice: "или −3 балла",
    creditCost: 3,
    tone: "free",
    cta: "Разобраться вместе",
    directCta: "Открыть «Вместе»",
    directHref: "/products/pair",
    mechanics: ["взгляд со стороны по ссылке", "согласие участников", "приватные ответы", "совместный итог"],
    privacy: "Приватные ответы не раскрываются как инструмент давления — только общий бережный итог.",
    result: "Где совпали ожидания, где напряжение, что стоит обсудить и один безопасный шаг.",
  },
  {
    slug: "my-map",
    route: "/products/my-map",
    name: "Расширенная карта",
    eyebrow: "углубление · годовой портрет",
    summary: "Годовой разбор паттернов и тем — на основе всех ваших разборов в Моей карте. Что повторялось, что менялось, какие сценарии стихли, какие — окрепли.",
    price: "990 ₽",
    priceMeta: "или −6 баллов",
    creditPrice: "или −6 баллов",
    creditCost: 6,
    tone: "private",
    cta: "Сохранить в карту",
    directCta: "Расширить карту",
    productKey: "my-map",
    mechanics: ["сохранить, скрыть или удалить", "экспорт", "обезличенный фрагмент для шаринга", "карта дня"],
    privacy: "Карта приватна по умолчанию и не содержит медицинских диагнозов.",
    result: "Накопленная личная карта тем, решений и повторяющихся паттернов.",
  },
  {
    slug: "tarot",
    route: "/products/tarot",
    name: "Расклад Таро",
    eyebrow: "расклад · тематический разбор",
    summary: "Три карты на ваш вопрос. Не оракул и не приговор — приглашение посмотреть на ситуацию через символ. Карты выпадают случайно, разбор готовит таролог-практик ETerapy.",
    // B366: 590 ₽ / 2 балла (295 ₽/балл).
    price: "590 ₽",
    priceMeta: "или −2 балла",
    creditPrice: "или −2 балла",
    creditCost: 2,
    tone: "paid",
    cta: "Разложить карты",
    directCta: "Разложить карты",
    productKey: "tarot",
    mechanics: ["выбор вопроса", "случайный расклад", "этичная интерпретация", "без фатальных прогнозов"],
    privacy: "Вопрос и результат приватны; карточкой можно поделиться только после явного согласия.",
    result: "Символический разбор развилки, один образ ситуации и практичный следующий шаг.",
  },
  {
    slug: "natal-chart",
    route: "/products/natal-chart",
    name: "Натальная карта",
    eyebrow: "астрология · базовый разбор",
    summary: "Карта неба на момент вашего рождения — как символический портрет, а не сценарий. Разбираем ключевые акценты: где сильное «я», где обучение, где зона роста.",
    // B366: 590 ₽ / 2 балла (295 ₽/балл).
    price: "590 ₽",
    priceMeta: "или −2 балла · с картой партнёра — совместимость по звёздам 890 ₽",
    creditPrice: "или −2 балла · с картой партнёра — совместимость по звёздам 890 ₽",
    creditCost: 2,
    tone: "paid",
    cta: "Открыть карту",
    directCta: "Заполнить данные рождения",
    productKey: "natal-chart",
    mechanics: ["данные рождения", "темы и акценты", "этичная трактовка", "связь с вопросом"],
    privacy: "Данные рождения используются только для выбранного разбора и не публикуются.",
    result: "Символический портрет тем, повторов и зон внимания в контексте вашего запроса.",
  },
  {
    slug: "synastry",
    route: "/products/synastry",
    name: "Совместимость по звёздам",
    eyebrow: "астрология · две натальные карты рядом",
    summary: "Сравнение двух натальных карт как язык динамики пары: где легче совпасть, где разные ритмы, какие вопросы помогают разговаривать бережнее.",
    // B366: 890 ₽ / 3 балла (≈297 ₽/балл).
    price: "890 ₽",
    priceMeta: "или −3 балла · натальная карта + партнёр",
    creditPrice: "или −3 балла",
    creditCost: 3,
    tone: "paid",
    cta: "Сравнить карты",
    directCta: "Сравнить карты",
    productKey: "synastry",
    mechanics: ["данные рождения двоих", "карта ресурсов пары", "зоны различий", "вопросы для разговора"],
    privacy: "Данные рождения обоих участников используются только для выбранного разбора и не публикуются.",
    result: "Символическая карта пары: общие ресурсы, разные ритмы, точки напряжения и один безопасный разговорный шаг.",
  },
  {
    slug: "numerology",
    route: "/products/numerology",
    name: "Числовой портрет",
    eyebrow: "нумерология · число имени и даты",
    summary: "Короткий язык чисел про ваши темы и ритмы. Не приговор и не «когда выйти замуж», а удобная схема, на которой видны сильные стороны, повторяющиеся уроки и цикл года.",
    // B366: 590 ₽ / 2 балла (295 ₽/балл).
    price: "590 ₽",
    priceMeta: "или −2 балла",
    creditPrice: "или −2 балла",
    creditCost: 2,
    tone: "paid",
    cta: "Собрать портрет",
    directCta: "Собрать портрет",
    productKey: "numerology",
    mechanics: ["имя и дата рождения", "личные темы", "цикл года", "бережный вывод без обещаний"],
    privacy: "Персональные данные остаются в вашем аккаунте и не используются для публичных материалов.",
    result: "Короткий символический портрет и один практичный вопрос к себе.",
  },
  // M26/B367: joint-session («Эзотерик + психотерапевт») закрыт как услуга —
  // вместо него бейдж практика «психология + эзотерика» в каталоге специалистов.
];

// B366: derive `price` (₽ label) and `creditCost` (баллы) from the single billing
// source so the public catalog is provably consistent with checkout. Products
// without a price entry (e.g. the free «Ежедневная практика») keep their literal.
export const v5Products: V5Product[] = RAW_V5_PRODUCTS.map((product) => {
  const kopecks = V5_PRODUCT_PRICES_KOPECKS[product.slug];
  const cost = V5_PRODUCT_CREDIT_COSTS[product.slug];
  if (kopecks == null || cost == null) return product;
  return { ...product, price: formatRubFromKopecks(kopecks), creditCost: cost };
});

export function getV5Product(slug: string): V5Product | undefined {
  return v5Products.find((product) => product.slug === slug);
}
