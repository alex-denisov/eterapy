export type V5ProductSlug =
  | "clarity-practice"
  | "perspectives"
  | "deep-report"
  | "chat-analysis"
  | "compatibility"
  | "circle"
  | "pair"
  | "seven-days"
  | "my-map"
  | "tarot"
  | "natal-chart"
  | "numerology"
  | "joint-session";

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

export const v5Products: V5Product[] = [
  {
    slug: "clarity-practice",
    route: "/products/clarity-practice",
    name: "Практика ясности",
    eyebrow: "Ежедневный ритм",
    summary: "Один короткий вопрос, один ракурс и один маленький шаг в день. Формат помогает возвращаться к себе без длинной сессии.",
    price: "0 ₽",
    priceMeta: "расширение — от 199 ₽",
    creditPrice: "расширение — от 199 ₽",
    creditCost: null,
    tone: "free",
    cta: "Сегодняшний вопрос",
    directCta: "Открыть практику в кабинете",
    // B300: /practice was retired in B287 — the canonical practice
    // surface lives inside the cabinet at app.eterapy.com/modalities.
    // Use an absolute URL so the link works from the public product
    // page on eterapy.com.
    directHref: "https://app.eterapy.com/modalities",
    mechanics: ["один вопрос в день", "короткий ракурс", "мягкие напоминания", "кредиты за осмысленное действие"],
    privacy: "Напоминания и сохранение работают только по выбранным пользователем каналам.",
    result: "Ежедневная привычка, которая пополняет личную карту без давления и публичности.",
  },
  {
    slug: "perspectives",
    route: "/products/perspectives",
    name: "4 ракурса ответа",
    eyebrow: "углубление",
    summary: "Один вопрос раскрывается через рациональный, эмоциональный, символический и практический ракурс.",
    price: "299 ₽",
    priceMeta: "или −2 кредита ясности",
    creditPrice: "или −2 кредита ясности",
    creditCost: 2,
    tone: "paid",
    cta: "Углубить ответ",
    directCta: "Купить 4 ракурса",
    productKey: "perspectives",
    mechanics: ["рациональный ракурс", "эмоциональный ракурс", "символический без фатальности", "практические действия"],
    privacy: "Работает от контекста диалога; приватные данные не публикуются.",
    result: "Четыре перспективы и итог, который можно сохранить в Моей карте.",
  },
  {
    slug: "deep-report",
    route: "/products/deep-report",
    name: "Глубокий отчёт",
    eyebrow: "углубление · документ-разбор",
    summary: "Полноценный разбор-документ на 10–15 страниц. С оглавлением, выводами и рекомендациями. Можно скачать PDF, сохранить в Мою карту, обсудить со специалистом.",
    price: "590 ₽",
    priceMeta: "или −4 кредита ясности · в Plus входит",
    creditPrice: "или −4 кредита ясности · в Plus входит",
    creditCost: 4,
    tone: "paid",
    cta: "Посмотреть глубину",
    directCta: "Купить отчёт",
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
    summary: "Анализ текста или скрина переписки: Start для первой покупки, Deep для динамики общения, Pro с вариантами ответа.",
    price: "390 ₽",
    priceMeta: "Start · глубокие уровни доступны после первого разбора",
    creditPrice: "от −2 кредитов ясности",
    creditCost: 2,
    tone: "private",
    cta: "Разобрать переписку",
    directCta: "Разобрать переписку",
    productKey: "chat-analysis",
    mechanics: ["вставка или загрузка", "предупреждение о персональных данных", "распознавание текста до оплаты", "удаление источника", "варианты ответа в Pro"],
    privacy: "Пользователь подтверждает право использовать переписку и может удалить исходник.",
    result: "Наблюдения по динамике общения, границам и возможным формулировкам ответа.",
  },
  {
    slug: "compatibility",
    route: "/products/compatibility",
    name: "Совместимость",
    eyebrow: "Согласие партнера",
    summary: "Парный отчет, который открывается только после согласия и завершения обеих сторон.",
    price: "590 ₽",
    priceMeta: "один отчёт на двоих",
    creditPrice: "от −4 кредитов ясности",
    creditCost: 4,
    tone: "paid",
    cta: "Создать совместимость",
    directCta: "Купить совместимость",
    productKey: "compatibility",
    mechanics: ["ссылка-приглашение", "согласие партнера", "бесплатный teaser", "платный полный отчет"],
    privacy: "Автор не видит приватные ответы партнера до завершения и разрешенного результата.",
    result: "Общие паттерны, точки напряжения, точки поддержки и практичные темы для разговора.",
  },
  {
    slug: "seven-days",
    route: "/products/seven-days",
    name: "7 дней к ясности",
    eyebrow: "Маршрут ясности",
    summary: "Маршрут из коротких ежедневных шагов по 5-10 минут с итоговым отчетом.",
    price: "990 ₽",
    priceMeta: "или −8 кредитов ясности",
    creditPrice: "или −8 кредитов ясности",
    creditCost: 8,
    tone: "route",
    cta: "Начать день 1",
    directCta: "Купить маршрут",
    productKey: "seven-days",
    mechanics: ["статус дня", "пауза и продолжение", "напоминания", "итоговый отчет"],
    privacy: "Напоминания работают только по выбранным каналам и preference center.",
    result: "Семь дневных шагов, мягкий прогресс и финальный отчет по вопросу.",
  },
  {
    slug: "my-map",
    route: "/products/my-map",
    name: "Расширенная карта",
    eyebrow: "углубление · годовой портрет",
    summary: "Годовой разбор паттернов и тем — на основе всех ваших разборов в Моей карте. Что повторялось, что менялось, какие сценарии стихли, какие — окрепли.",
    price: "990 ₽",
    priceMeta: "или −6 кредитов · раз в год бесплатно в Plus",
    creditPrice: "или −6 кредитов · раз в год бесплатно в Plus",
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
    price: "390 ₽",
    priceMeta: "или −2 кредита ясности",
    creditPrice: "или −2 кредита ясности",
    creditCost: 2,
    tone: "paid",
    cta: "Разложить карты",
    directCta: "Купить расклад",
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
    price: "590 ₽",
    priceMeta: "или −4 кредита · с картой партнёра — синастрия 990 ₽",
    creditPrice: "или −4 кредита · с картой партнёра — синастрия 990 ₽",
    creditCost: 4,
    tone: "paid",
    cta: "Открыть карту",
    directCta: "Купить натальную карту",
    productKey: "natal-chart",
    mechanics: ["данные рождения", "темы и акценты", "этичная трактовка", "связь с вопросом"],
    privacy: "Данные рождения используются только для выбранного разбора и не публикуются.",
    result: "Символический портрет тем, повторов и зон внимания в контексте вашего запроса.",
  },
  {
    slug: "numerology",
    route: "/products/numerology",
    name: "Числовой портрет",
    eyebrow: "нумерология · число имени и даты",
    summary: "Короткий язык чисел про ваши темы и ритмы. Не приговор и не «когда выйти замуж», а удобная схема, на которой видны сильные стороны, повторяющиеся уроки и цикл года.",
    price: "390 ₽",
    priceMeta: "или −2 кредита ясности",
    creditPrice: "или −2 кредита ясности",
    creditCost: 2,
    tone: "paid",
    cta: "Собрать портрет",
    directCta: "Купить портрет",
    productKey: "numerology",
    mechanics: ["имя и дата рождения", "личные темы", "цикл года", "бережный вывод без обещаний"],
    privacy: "Персональные данные остаются в вашем аккаунте и не используются для публичных материалов.",
    result: "Короткий символический портрет и один практичный вопрос к себе.",
  },
  {
    slug: "joint-session",
    route: "/products/joint-session",
    name: "Эзотерик + психотерапевт",
    eyebrow: "новый формат · 60 минут · 2 специалиста",
    summary: "Один час, два голоса. Эзотерик предлагает символический язык — психотерапевт удерживает контекст и безопасный следующий шаг. Чтобы метафора не уносила, а помогала.",
    price: "от 4 500 ₽",
    priceMeta: "полная ставка двух специалистов, без скидок",
    creditPrice: null,
    creditCost: null,
    tone: "paid",
    cta: "Подобрать специалистов",
    directCta: "Записаться",
    directHref: "/practitioners?format=joint-session",
    mechanics: ["60 минут онлайн", "два специалиста", "согласованный протокол", "оплата по полной ставке специалистов"],
    privacy: "Контекст передается специалистам только по вашему согласию перед записью.",
    result: "Живая встреча, где символический язык сразу переводится в безопасный практический шаг.",
  },
];

export function getV5Product(slug: string): V5Product | undefined {
  return v5Products.find((product) => product.slug === slug);
}
