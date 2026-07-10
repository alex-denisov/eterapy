import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import type { NatalWheel } from "@/lib/esoteric-chart";
import { buildNatalEphemerisWheel, textMentionsZodiacSign } from "@/lib/natal-ephemeris";
import { computeNumerology, numerologyFactsForAI, type NumerologyPortrait } from "@/lib/numerology";
import { computeHumanDesignFromText } from "@/lib/human-design";
import type { HumanDesignChart } from "@/lib/human-design-data";
import { analyzeSurname, surnameFactsForAI, type SurnameStory } from "@/lib/surname-story";
import { log, serializeError } from "@/lib/logger";
import { normalizeResultSectionHeadings, splitSections } from "@/lib/report-sections";
import { TAROT_DECK, type TarotCard } from "@/lib/tarot-deck";

// Данные колоды + поиск карты по имени живут в client-safe `@/lib/tarot-deck`
// (без server-импортов), чтобы клиентские визуалы не тянули pg в бандл. Здесь —
// реэкспорт для существующих импортеров `@/lib/symbolic-products`.
export { TAROT_DECK, tarotDeckCardByName } from "@/lib/tarot-deck";
export type { TarotCard, TarotDeckCard } from "@/lib/tarot-deck";

export const SYMBOLIC_PRODUCT_DEFINITIONS = [
  {
    productKey: "tarot",
    title: "Расклад Таро",
    promptLabel: "Вопрос для расклада",
    resultTitle: "Символический расклад Таро",
  },
  {
    productKey: "natal-chart",
    title: "Натальная карта",
    promptLabel: "Дата, время и место рождения",
    resultTitle: "Натальная карта как язык тем",
  },
  {
    productKey: "numerology",
    title: "Числовой портрет",
    promptLabel: "Имя и дата рождения",
    resultTitle: "Числовой портрет",
  },
  {
    // B389 (M26): genogram-разбор «Семейные сценарии» (рекомендуется в Дневнике).
    productKey: "family-scenarios",
    title: "Семейные сценарии",
    promptLabel: "Что повторяется в вашей семье и роду",
    resultTitle: "Семейные сценарии: что повторяется в роду",
  },
  {
    // B387 (M26): «Дизайн человека». Тип/бодиграф считаются бесплатно и
    // детерминированно (human-design.ts); этот платный разбор расшифровывает
    // рассчитанный чарт (каналы, профиль, маршрут) человеческим языком.
    productKey: "human-design",
    title: "Дизайн человека",
    promptLabel: "Дата, время и место рождения",
    resultTitle: "Дизайн человека: ваш тип и стратегия",
  },
  {
    // B391 (M26): «История фамилии». Короткая история фамилии считается бесплатно
    // и детерминированно (surname-story.ts по форме); этот платный «родовой разбор»
    // расширяет распознанную форму в тёплый нарратив про род человеческим языком.
    productKey: "surname-story",
    title: "История фамилии",
    promptLabel: "Ваша фамилия",
    resultTitle: "История фамилии: что говорит ваш род",
  },
] as const;

export type SymbolicProductKey = (typeof SYMBOLIC_PRODUCT_DEFINITIONS)[number]["productKey"];

export function isSymbolicProductKey(value: string): value is SymbolicProductKey {
  return SYMBOLIC_PRODUCT_DEFINITIONS.some((definition) => definition.productKey === value);
}

export function getSymbolicProductDefinition(productKey: string) {
  return SYMBOLIC_PRODUCT_DEFINITIONS.find((definition) => definition.productKey === productKey) ?? null;
}

// #12: реальный расклад на полной колоде из 78 карт. Типы и данные колоды —
// в `@/lib/tarot-deck` (реэкспортированы выше).
// Расклад — это выбор ГЛУБИНЫ/формата (число карт и позиции), а не темы вопроса.
// Пользователь выбирает не «сколько карт», а named-расклад по глубине — как у
// Labyrinthos/Biddy. Каноничная тройка (см. docs/Design/tarot-domain-research.md):
// одна карта (быстрый ответ), три карты (Прошлое/Настоящее/Будущее), Кельтский
// крест (10) из «Pictorial Key» Уэйта.
export type TarotSpreadKey = "one" | "three" | "celtic";

export const TAROT_SPREAD_PRESETS: Record<TarotSpreadKey, {
  key: TarotSpreadKey;
  label: string;
  positions: readonly string[];
}> = {
  one: {
    key: "one",
    label: "1 карта",
    positions: ["Совет"],
  },
  three: {
    key: "three",
    label: "3 карты",
    positions: ["Прошлое", "Настоящее", "Будущее"],
  },
  celtic: {
    key: "celtic",
    label: "Кельтский крест · 10",
    positions: ["Сейчас", "Вызов", "Прошлое", "Будущее", "Цель", "Основа", "Совет", "Внешнее", "Надежды и страхи", "Итог"],
  },
};

const TAROT_POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;

export function resolveTarotSpread(value?: string | null) {
  if (value && value in TAROT_SPREAD_PRESETS) {
    return TAROT_SPREAD_PRESETS[value as TarotSpreadKey];
  }
  return TAROT_SPREAD_PRESETS.three;
}

function seededHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function drawTarotSpread(seed: string, positions: readonly string[] = TAROT_POSITIONS): TarotCard[] {
  let state = seededHash(seed) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  const deck = TAROT_DECK.map((card) => ({ ...card }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return positions.map((position, idx) => {
    const card = deck[idx];
    const reversed = next() < 0.28;
    return {
      ...card,
      position,
      meaning: reversed ? card.reversedMeaning : card.upright,
      uprightMeaning: card.upright,
      reversedMeaning: card.reversedMeaning,
      reversed,
    };
  });
}

function tarotReadingFromCards(cards: TarotCard[], userInput: string, spreadLabel?: string, theme?: string): string {
  const intro = userInput.trim()
    ? `Расклад на ваш вопрос: «${userInput.trim().slice(0, 160)}».`
    : "Расклад на вашу ситуацию.";
  const context = [
    spreadLabel ? `Формат: ${spreadLabel}.` : "",
    theme ? `Тема: ${theme}.` : "",
  ].filter(Boolean).join(" ");
  const lines = cards.map((card) => {
    const orientation = card.reversed ? " (перевёрнутая)" : "";
    // #1: положение карты — только в заголовке секции (на карте оно тоже видно),
    // без отдельной строки-дубля; и без вопроса к себе в конце — дальнейшие шаги
    // и рекомендации идут отдельным блоком после расклада.
    return `## ${card.position}: ${card.name}${orientation}\n${card.reversed ? "В перевёрнутом положении энергия карты приглушена или обращена внутрь. " : ""}${card.meaning}. В позиции «${card.position}» это показывает, на что опираться в вашей ситуации.`;
  });
  // #6: разбор заканчивается СМЫСЛОМ расклада, без шаблонного «следующего шага» —
  // дальнейшие действия предлагаются отдельным блоком рекомендаций после расклада.
  const synthesis = `## Общий смысл\n${cards.map((card) => card.name).join(", ")} складываются в одну линию вашей ситуации. Прочитайте карты вместе: где одна продолжает другую, а где между ними напряжение — там и живёт ответ, который вы уже чувствуете.`;
  return [intro, context, ...lines, synthesis].filter(Boolean).join("\n\n");
}

export function buildSymbolicProductTeaser(input: {
  productKey: SymbolicProductKey;
  userInput: string;
  generatedText: string;
}) {
  const generatedLines = input.generatedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstMeaningfulLine = generatedLines.find((line) => !/^расклад|натальная карта|числовой портрет|расширенная карта/i.test(line))
    ?? generatedLines[0]
    ?? "В вашем запросе уже видна одна тема, которую можно рассмотреть прямо, без фатальных обещаний.";

  if (input.productKey === "tarot") {
    return [
      "Первая карта",
      firstMeaningfulLine,
      "",
      "Полный расклад откроет остальные карты и общий синтез.",
    ].join("\n");
  }

  if (input.productKey === "natal-chart") {
    return [
      "Один акцент натальной карты",
      firstMeaningfulLine,
      "",
      "Полный разбор раскроет дополнительные темы и практический маршрут.",
    ].join("\n");
  }

  if (input.productKey === "numerology") {
    const yearLine = generatedLines.find((line) => /число года/i.test(line)) ?? firstMeaningfulLine;
    const strengthLine = generatedLines.find((line) => /сильная сторона/i.test(line)) ?? "Сильная сторона: замечать повторяющийся ритм и выбирать следующий шаг спокойнее.";
    return [
      yearLine,
      strengthLine,
      "",
      "Полный портрет откроет остальные числа и рекомендации.",
    ].join("\n");
  }

  if (input.productKey === "family-scenarios") {
    const repeated = extractRepeatedTheme(input.userInput);
    return [
      "Один повторяющийся сценарий",
      repeated
        ? `В вашем описании рода чаще всего звучит: ${repeated}.`
        : firstMeaningfulLine,
      "",
      "Полный разбор покажет, что передаётся из поколения в поколение и где это можно бережно прервать.",
    ].join("\n");
  }

  if (input.productKey === "human-design") {
    const { chart } = computeHumanDesignFromText(input.userInput);
    return [
      chart ? `Ваш тип — ${chart.typeName}` : "Ваш тип",
      chart
        ? `Стратегия: ${chart.strategy.toLowerCase()}. Внутренний авторитет: ${chart.authorityName.toLowerCase()}.`
        : firstMeaningfulLine,
      "",
      "Полный разбор расшифрует ваши каналы, профиль и покажет, как применять свою стратегию в жизни.",
    ].join("\n");
  }

  if (input.productKey === "surname-story") {
    const story = analyzeSurname(input.userInput);
    return [
      story ? story.originLabel : "Форма вашей фамилии",
      story ? story.originStory : firstMeaningfulLine,
      "",
      "Полный родовой разбор раскроет вероятное происхождение, родовую тему и что из этого может откликаться у вас сегодня.",
    ].join("\n");
  }

  const repeatedTheme = extractRepeatedTheme(input.userInput);
  return [
    "Повторяющаяся тема",
    repeatedTheme
      ? `В вашей истории чаще всего звучит тема: ${repeatedTheme}.`
      : firstMeaningfulLine,
    "",
    "Полная карта соберет годовую динамику, ослабшие темы и следующий шаг.",
  ].join("\n");
}

function normalizeInput(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

function normalizeResult(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 30_000);
}

function extractRepeatedTheme(text: string) {
  const stopWords = new Set(["хочу", "темы", "года", "отношения", "работа", "сейчас", "этой", "этот", "если", "мне", "что"]);
  const counts = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word))
    .reduce<Map<string, number>>((acc, word) => {
      acc.set(word, (acc.get(word) ?? 0) + 1);
      return acc;
    }, new Map());

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function heuristicSymbolicResult(input: { productKey: SymbolicProductKey; userInput: string }) {
  if (input.productKey === "tarot") {
    return [
      "## Картина расклада",
      "",
      "Прошлое — Жрица. Похоже, часть ответа вы уже слышали внутри, но пока не дали ей языка.",
      "Настоящее — Башня. Сейчас рушится не вся ситуация, а прежний способ держаться за неё.",
      "Возможное — Звезда. Путь начинается с паузы, честного вопроса к себе и отказа от решения на пике эмоций.",
      "",
      "## Как действовать по раскладу",
      "Запишите, что в этой ситуации является фактом, а что — образом страха. По этому раскладу сильнее выглядит не резкое действие, а ход, который сначала возвращает вам контроль над собственной позицией.",
    ].join("\n");
  }
  if (input.productKey === "natal-chart") {
    return [
      "## Главная конфигурация карты",
      "",
      "В фокусе этой карты — где вам легче начинать, где нужна опора, и какой язык поддержки подходит именно вам.",
      "",
      "## Как работать с этой картой дальше",
      "Сейчас важно не искать «правильный знак», а заметить, какую часть себя вы пытаетесь обойти ради внешнего спокойствия.",
    ].join("\n");
  }
  if (input.productKey === "numerology") {
    return [
      "## Карта чисел",
      "",
      "Числа здесь работают как короткий язык повторов. Один слой показывает, где вам нужна свобода движения, другой — где вы ищете тишину и смысл.",
      "",
      "## Практический ориентир",
      "Проверьте, где вы сейчас тратите силы против собственного ритма, а где энергия появляется почти сама.",
    ].join("\n");
  }
  if (input.productKey === "family-scenarios") {
    return [
      "Семейные сценарии",
      "",
      "Этот разбор читается как карта повторов, а не приговор рода. Мы смотрим, какие роли, темы и негласные правила передавались по семье — и какие из них вы уже несёте, не выбирая.",
      "",
      "Один частый узор: то, что в одном поколении было способом выжить, в следующем становится привычкой, которая больше не нужна.",
      "",
      "Практический ориентир: выберите один сценарий, который вы НЕ хотите передавать дальше, и назовите, как он проявляется у вас сейчас.",
    ].join("\n");
  }
  return [
    "Символический разбор ETerapy",
    "",
    "Этот разбор — язык образов и тем, а не приговор. Мы смотрим, что в вашем запросе повторяется и просит больше внимания.",
    "",
    "Практический ориентир: выберите одну тему из разбора и назовите один маленький шаг, который можно сделать на этой неделе.",
  ].join("\n");
}

// B387: факты рассчитанного чарта для AI, чтобы разбор опирался на реальный тип,
// а не выдумывал. Передаём в системный промт как «вот что точно посчитано».
function humanDesignFactsForAI(chart: HumanDesignChart): string {
  const defined = chart.centers.filter((c) => c.defined).map((c) => c.name).join(", ") || "нет определённых центров";
  const open = chart.centers.filter((c) => !c.defined).map((c) => c.name).join(", ") || "нет открытых центров";
  const channels = chart.definedChannels.map((c) => `${c.gates[0]}-${c.gates[1]}`).join(", ") || "нет";
  const column = (activations: HumanDesignChart["personality"]) => activations
    .map((activation) => `${activation.label} ${activation.gate}.${activation.line}`)
    .join("; ");
  return [
    "ТОЧНО РАССЧИТАНО (не меняй и не выдумывай эти факты):",
    `Тип: ${chart.typeName}. Стратегия: ${chart.strategy}. Внутренний авторитет: ${chart.authorityName}.`,
    `Профиль: ${chart.profile} (${chart.profileName}). Определение: ${chart.definition}.`,
    `Определённые центры: ${defined}.`,
    `Открытые центры: ${open}.`,
    `Определённые каналы: ${channels}.`,
    `Все активные ворота: ${chart.activeGates.join(", ")}.`,
    `Колонка Личность: ${column(chart.personality)}.`,
    `Колонка Дизайн: ${column(chart.design)}.`,
    `Подпись: ${chart.signature}. Тема не-я: ${chart.notSelf}.`,
    chart.hasExactTime ? "Указано точное время рождения." : "Время рождения не указано — считай тип как ориентир и прямо укажи, что точность ограничена.",
    "Объясни ИМЕННО эти тип/стратегию/авторитет/профиль/каналы человеческим языком. Результат должен быть связан с конкретным бодиграфом, а не быть общей статьей о Human Design.",
  ].join("\n");
}

function humanDesignFallback(chart: HumanDesignChart | null): string {
  if (!chart) {
    return [
      "Дизайн человека",
      "",
      "Чтобы посчитать тип точно, нужна дата рождения с годом, а лучше — точное время и город. Тип и бодиграф строятся по реальному положению светил в момент рождения.",
      "",
      "Практический ориентир: укажите данные рождения как можно точнее — и здесь появится ваш тип, стратегия и авторитет.",
    ].join("\n");
  }
  return [
    `## Тип и стратегия`,
    "",
    `Ваш тип — ${chart.typeName}. ${chart.typeSummary}`,
    "",
    `## Внутренний авторитет\n${chart.authorityName}. ${chart.authorityHint}`,
    `## Профиль ${chart.profile} — ${chart.profileName}\nЭто язык того, как вы естественно учитесь и проявляетесь.`,
    "",
    "## Как применять дизайн",
    `Подпись «${chart.signature}» — знак, что вы живёте по себе; «${chart.notSelf.toLowerCase()}» — сигнал свернуть не туда. Это карта самопонимания, а не приговор.`,
  ].join("\n");
}

// B391: детерминированный фолбэк родового разбора по распознанной форме фамилии.
function surnameStoryFallback(story: SurnameStory | null): string {
  if (!story) {
    return [
      "История фамилии",
      "",
      "Чтобы рассказать историю фамилии, напишите саму фамилию — например «Кузнецов» или «Ковальчук». По её форме видно происхождение и вероятное занятие или местность предков.",
      "",
      "Практический ориентир: укажите фамилию, и здесь появится её короткая история, вероятная форма происхождения и следы для проверки.",
    ].join("\n");
  }
  return [
    `## Что говорит форма фамилии`,
    "",
    `${story.surname}: ${story.originLabel}. ${story.originStory}`,
    story.rootHint ? `## Профессия, статус или образ предка\nВероятно, фамилия связана с ${story.rootHint}.` : "",
    story.regionHint ? `## География и исторический контекст\nТакая форма ${story.regionHint}.` : "",
    `## Родовая тема\n${story.familyTheme}. Это тема для размышления, а не судьба и не приговор роду.`,
    "",
    "## Что проверить в семейной истории\nСпросите старших родственников о местах рождения, занятиях, старых документах, вариантах написания фамилии и семейных легендах.",
  ].filter(Boolean).join("\n");
}

// B450: факты натальной карты для AI — твёрдый знак Солнца + стихия/модальность
// (по дате), чтобы разбор совпадал с колесом и опирался на реальное Солнце, а не
// выдумывал символические Луну/Асцендент как факт.
function natalFactsForAI(wheel: NatalWheel, userInput: string): string {
  const MODALITY_BY_KEY: Record<string, string> = {
    aries: "кардинальный", cancer: "кардинальный", libra: "кардинальный", capricorn: "кардинальный",
    taurus: "фиксированный", leo: "фиксированный", scorpio: "фиксированный", aquarius: "фиксированный",
    gemini: "мутабельный", virgo: "мутабельный", sagittarius: "мутабельный", pisces: "мутабельный",
  };
  const modality = MODALITY_BY_KEY[wheel.sunSign.key] ?? "—";
  const polarity = wheel.sunSign.element === "огонь" || wheel.sunSign.element === "воздух"
    ? "активная (ян)"
    : "воспринимающая (инь)";
  const hasTime = /\b\d{1,2}[:.]\d{2}\b/.test(userInput);
  const placements = wheel.placements
    .map((placement) => `${placement.label}: ${placement.degreeInSign.toFixed(1)}° ${placement.signName}`)
    .join("; ");
  const houses = wheel.houses?.map((house) => `${house.number} дом — ${house.signName} ${house.cusp.toFixed(1)}°`).join("; ") ?? "не рассчитаны";
  return [
    "ТОЧНО ПОСЧИТАНО ПО ЭФЕМЕРИДАМ (не меняй эти факты):",
    `Солнце в знаке ${wheel.sunSign.name} (${wheel.sunSign.glyph}). Стихия: ${wheel.sunSign.element}. Модальность: ${modality}. Полярность: ${polarity}.`,
    `Положения: ${placements}.`,
    wheel.ascendant && wheel.ascendantDegree !== null && wheel.ascendantDegree !== undefined
      ? `Асцендент: ${wheel.ascendantDegree.toFixed(1)}° ${wheel.ascendant.name}. Равнодомные куспиды: ${houses}.`
      : hasTime
        ? "Время рождения передано, но координаты города не распознаны: не утверждай конкретный ASC и дома. Все положения десяти планет рассчитаны точно и должны быть разобраны."
        : "Точное время рождения не указано: не утверждай конкретный ASC и дома. Положения десяти планет на полдень рассчитаны и должны быть разобраны с оговоркой только для быстро движущейся Луны.",
    "Каждый раздел связывай с этими конкретными положениями. Не вставляй общие дисклеймеры в текст результата.",
  ].join("\n");
}

function numerologyMatches(text: string, portrait: NumerologyPortrait) {
  const required = [
    `Число пути ${portrait.lifePath}`,
    portrait.expression === null ? null : `Число выражения ${portrait.expression}`,
    portrait.soulUrge === null ? null : `Число души ${portrait.soulUrge}`,
  ].filter((value): value is string => Boolean(value));
  return required.every((value) => text.toLowerCase().includes(value.toLowerCase()));
}

function symbolicSectionHeadings(input: {
  productKey: SymbolicProductKey;
  cards: TarotCard[] | null;
  numerology: NumerologyPortrait | null;
}): string[] | null {
  if (input.productKey === "tarot" && input.cards) {
    return [
      "Картина расклада",
      ...input.cards.map((card) => `${card.position}: ${card.name}`),
      "Связь карт и скрытая линия",
      "Ответ расклада",
      "Вероятная динамика",
      "Предупреждение карт",
    ];
  }
  if (input.productKey === "natal-chart") {
    return ["Главная конфигурация карты", "Солнце, стихия и модальность", "Луна, Асцендент и личные планеты", "Дома и сферы жизни", "Аспекты: где напряжение и где ресурс", "Персональный синтез карты", "Как читать эту карту в жизни"];
  }
  if (input.productKey === "numerology" && input.numerology) {
    return [
      "Карта чисел",
      `Число пути ${input.numerology.lifePath} — главный вектор`,
      ...(input.numerology.expression === null ? [] : [`Число выражения ${input.numerology.expression} — как вы проявляетесь`]),
      ...(input.numerology.soulUrge === null ? [] : [`Число души ${input.numerology.soulUrge} — что вами движет`]),
      "Сильные стороны и теневая сторона",
      "Повторяющийся сценарий",
      "Синтез числового портрета",
      "Практический ориентир на ближайшее время",
    ];
  }
  if (input.productKey === "human-design") {
    return ["Тип и стратегия", "Внутренний авторитет", "Профиль и роль", "Центры: где определенность и где восприимчивость", "Каналы и ворота", "Тема не-я и сигналы сбоя", "Синтез вашего бодиграфа", "Как применять дизайн"];
  }
  if (input.productKey === "surname-story") {
    return ["Что говорит форма фамилии", "Вероятные корни и версии происхождения", "География и исторический контекст", "Профессия, статус или прозвище предка", "Известные ассоциации и тёмные версии", "Факты, версии и границы достоверности", "Что проверить в семейной истории", "Итог исследования фамилии"];
  }
  return null;
}

function headingKey(value: string) {
  return value
    .replace(/^\d{1,2}[.)]\s*/, "")
    .replace(/[–-]/g, "—")
    .replace(/\s+/g, " ")
    .replace(/[.:;]+$/, "")
    .trim()
    .toLocaleLowerCase("ru");
}

function mergeSymbolicSections(productKey: string, headings: string[], texts: string[]) {
  const wanted = new Map(headings.map((heading) => [headingKey(heading), heading]));
  const bodies = new Map<string, string>();
  for (const text of texts) {
    const normalized = normalizeResultSectionHeadings(productKey, normalizeResult(text));
    for (const section of splitSections(normalized)) {
      const canonical = wanted.get(headingKey(section.title));
      if (!canonical || !section.body.trim()) continue;
      const existing = bodies.get(canonical) ?? "";
      if (section.body.trim().length > existing.length) bodies.set(canonical, section.body.trim());
    }
  }
  return headings
    .filter((heading) => bodies.has(heading))
    .map((heading) => `## ${heading}\n\n${bodies.get(heading)}`)
    .join("\n\n");
}

function weakestSymbolicHeadings(headings: string[], text: string, limit = 4) {
  const sizes = new Map(splitSections(text).map((section) => [headingKey(section.title), section.body.length]));
  return [...headings]
    .sort((a, b) => (sizes.get(headingKey(a)) ?? -1) - (sizes.get(headingKey(b)) ?? -1))
    .slice(0, limit);
}

function segmentedRequestId(requestId: string | undefined, suffix: string) {
  return requestId ? `${requestId}:${suffix}` : undefined;
}

function symbolicQualityIssue(input: {
  productKey: SymbolicProductKey;
  text: string;
  cards: TarotCard[] | null;
  wheel: NatalWheel | null;
  chart: HumanDesignChart | null;
  surname: SurnameStory | null;
  numerology: NumerologyPortrait | null;
}) {
  const minimumChars: Partial<Record<SymbolicProductKey, number>> = {
    tarot: input.cards && input.cards.length >= 10 ? 7_500 : input.cards?.length === 1 ? 2_000 : 3_800,
    "natal-chart": 5_500,
    numerology: 5_000,
    "human-design": 4_800,
    "surname-story": 5_000,
  };
  if (input.text.length < (minimumChars[input.productKey] ?? 500)) return "результат слишком короткий";
  if (/\b(?:пользователь|клиент|заявитель|испытуемый)\b/iu.test(input.text)) return "заказчик описан в третьем лице";
  if (input.productKey === "numerology" && input.numerology && !numerologyMatches(input.text, input.numerology)) {
    return "числа в заголовках не совпадают с рассчитанным портретом";
  }
  if (input.productKey === "human-design" && input.chart) {
    const headings = ["Тип и стратегия", "Внутренний авторитет", "Профиль и роль", "Центры:", "Каналы и ворота", "Тема не-я", "Синтез вашего бодиграфа", "Как применять дизайн"];
    if (!headings.every((heading) => input.text.includes(`## ${heading}`))) return "нет обязательных разделов бодиграфа";
    if (!input.text.includes(input.chart.typeName) || !input.text.includes(input.chart.profile)) return "интерпретация не цитирует рассчитанный бодиграф";
  }
  if (input.productKey === "tarot" && input.cards) {
    const missingCard = input.cards.find((card) => !input.text.includes(card.name) || !input.text.includes(card.position));
    if (missingCard) return `нет трактовки карты ${missingCard.name} в позиции ${missingCard.position}`;
  }
  if (input.productKey === "natal-chart" && input.wheel) {
    const distinctSigns = [...new Set(input.wheel.placements.map((placement) => placement.signName))];
    if (distinctSigns.filter((sign) => textMentionsZodiacSign(input.text, sign)).length < Math.min(4, distinctSigns.length)) return "текст не опирается на рассчитанные положения планет";
  }
  if (input.productKey === "surname-story" && input.surname && !input.text.includes(input.surname.surname)) return "текст не называет исследуемую фамилию";
  return null;
}

// B450/B451: бюджет токенов на услугу для запроса в шлюз. Эффективный кап всё равно
// задаёт task-policy (routing.ts:138), но держим запрос крупным для полного разбора.
const SYMBOLIC_MAX_TOKENS: Partial<Record<SymbolicProductKey, number>> = {
  tarot: 3200,
  "natal-chart": 7000,
  numerology: 6000,
  "human-design": 6500,
  "surname-story": 6000,
  "family-scenarios": 6500,
};

export async function generateSymbolicProductResult(input: {
  productKey: SymbolicProductKey;
  userInput: string;
  userId: string;
  requestId?: string;
  tarotSpread?: TarotSpreadKey;
  tarotTheme?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const definition = getSymbolicProductDefinition(input.productKey);
  // #12: tarot draws real cards; cards are stored in metadata so the
  // page can render the actual cards, and the AI interprets exactly these cards.
  const tarotSpread = input.productKey === "tarot" ? resolveTarotSpread(input.tarotSpread) : null;
  const tarotTheme = input.productKey === "tarot" ? normalizeInput(input.tarotTheme ?? "").slice(0, 80) : "";
  const cards = input.productKey === "tarot"
    ? drawTarotSpread(`${input.userId}:${tarotSpread?.key}:${tarotTheme}:${normalizeInput(input.userInput)}`, tarotSpread?.positions)
    : null;
  // B388: натальная карта получает детерминированное структурное колесо в metadata,
  // чтобы страница услуги и PDF рендерили визуал, совпадающий с интерпретацией.
  const wheel = input.productKey === "natal-chart"
    ? (() => {
      try {
        return buildNatalEphemerisWheel(normalizeInput(input.userInput));
      } catch {
        return null;
      }
    })()
    : null;
  // B387: «Дизайн человека» — детерминированный чарт по реальным эфемеридам;
  // храним в metadata (для бодиграфа на странице/в PDF) и передаём в AI как факты.
  const hdChart = input.productKey === "human-design" ? computeHumanDesignFromText(input.userInput).chart : null;
  // B391: распознанная форма фамилии — детерминированно; храним в metadata (для
  // страницы/PDF) и передаём в AI как факты, чтобы разбор не выдумывал этимологию.
  const surnameStory = input.productKey === "surname-story" ? analyzeSurname(input.userInput) : null;
  // B451: числовой портрет — детерминированные ядровые числа (для визуала и фактов AI).
  const numerology = input.productKey === "numerology" ? computeNumerology(input.userInput) : null;
  const visualMeta: Prisma.InputJsonObject = {
    ...(cards ? { cards: cards as unknown as Prisma.InputJsonValue } : {}),
    ...(tarotSpread ? { tarotSpread: { key: tarotSpread.key, label: tarotSpread.label, positions: [...tarotSpread.positions] } } : {}),
    ...(tarotTheme ? { tarotTheme } : {}),
    ...(wheel ? { wheel: wheel as unknown as Prisma.InputJsonValue } : {}),
    ...(hdChart ? { chart: hdChart as unknown as Prisma.InputJsonValue } : {}),
    ...(surnameStory ? { surname: surnameStory as unknown as Prisma.InputJsonValue } : {}),
    ...(numerology ? { numerology: numerology as unknown as Prisma.InputJsonValue } : {}),
  };
  const cardsMeta = visualMeta;
  const fallback = cards
    ? tarotReadingFromCards(cards, input.userInput, tarotSpread?.label, tarotTheme)
    : input.productKey === "human-design"
      ? humanDesignFallback(hdChart)
      : input.productKey === "surname-story"
        ? surnameStoryFallback(surnameStory)
        : heuristicSymbolicResult(input);

  if (input.productKey === "natal-chart" && !wheel) {
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "birth_data_not_calculable", ...cardsMeta } };
  }

  try {
    // B362/Механика 7: каждый символический продукт должен использовать СВОЙ
    // промт (product-tarot / product-natal-chart / product-numerology / …),
    // а не один общий. Берём промт продукта из конфигурации промтов — тот же,
    // что виден и редактируется суперадмином в /admin/ai (DB-override применяется
    // дальше в applyAIPromptOverride). Раньше здесь был общий хардкод → все
    // символические продукты выходили «одинаковыми» и админ-промты не работали.
    const feature = `product-${input.productKey}`;
    const baseSystemPrompt = defaultPromptTextForFeature(feature);
    const tarotCardsNote = cards
      ? `\n\nЭто расклад "${tarotSpread?.label ?? "Таро"}" из ${cards.length} карт (${cards.map((card) => card.position).join(" / ")}). Интерпретируй ИМЕННО выпавшие карты ниже, по одной секции на карту, в контексте реального вопроса${tarotTheme ? ` (тематический фокус: "${tarotTheme}" — не ограничение сферы вопроса)` : ""}.`
      : "";
    const hdNote = hdChart ? `\n\n${humanDesignFactsForAI(hdChart)}` : "";
    const surnameNote = surnameStory ? `\n\n${surnameFactsForAI(surnameStory)}` : "";
    const natalNote = wheel ? `\n\n${natalFactsForAI(wheel, normalizeInput(input.userInput))}` : "";
    const numeroNote = numerology ? `\n\n${numerologyFactsForAI(numerology)}` : "";

    const systemPrompt = baseSystemPrompt + tarotCardsNote + hdNote + surnameNote + natalNote + numeroNote;
    const userContext = [
      `Услуга: ${definition?.title ?? input.productKey}.`,
      tarotSpread ? `Расклад: ${tarotSpread.label}.` : "",
      tarotTheme ? `Тематический фокус: ${tarotTheme}.` : "",
      cards ? `Выпавшие карты: ${cards.map((card) => `${card.position} — ${card.name}${card.reversed ? " (перевёрнутая)" : ""}`).join("; ")}.` : "",
      `Данные для разбора: ${normalizeInput(input.userInput) || "Нужен полный персональный разбор."}`,
    ].filter(Boolean).join("\n");
    const headings = symbolicSectionHeadings({ productKey: input.productKey, cards, numerology });
    const responses = [] as Awaited<ReturnType<typeof aiComplete>>[];
    let text = "";

    if (headings && headings.length > 1) {
      const midpoint = Math.ceil(headings.length / 2);
      const groups = [headings.slice(0, midpoint), headings.slice(midpoint)];
      const parts = await Promise.all(groups.map((group, index) => aiComplete({
        feature,
        userId: input.userId,
        requestId: segmentedRequestId(input.requestId, `part-${index + 1}`),
        maxTokens: SYMBOLIC_MAX_TOKENS[input.productKey] ?? 1400,
        temperature: 0.45,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              "Собери одну часть большого результата. Верни ТОЛЬКО перечисленные ниже разделы и не добавляй остальные.",
              "Каждый заголовок напиши дословно с `##`; внутри дай 3 содержательных абзаца по конкретным фактам, без вступления и заключения вне разделов.",
              ...group.map((heading) => `## ${heading}`),
              userContext,
            ].join("\n"),
          },
        ],
      })));
      responses.push(...parts);
      text = mergeSymbolicSections(input.productKey, headings, responses.map((response) => response.text));

      let issue = symbolicQualityIssue({ productKey: input.productKey, text, cards, wheel, chart: hdChart, surname: surnameStory, numerology });
      if (issue) {
        const repairHeadings = weakestSymbolicHeadings(headings, text);
        const repair = await aiComplete({
          feature,
          userId: input.userId,
          requestId: segmentedRequestId(input.requestId, "repair"),
          maxTokens: SYMBOLIC_MAX_TOKENS[input.productKey] ?? 1400,
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                `Дополни только слабые или отсутствующие разделы полного результата. Причина повторной генерации: ${issue}.`,
                "Верни только эти заголовки дословно с `##`. Каждый раздел — 3–4 конкретных абзаца; не добавляй другие разделы.",
                ...repairHeadings.map((heading) => `## ${heading}`),
                userContext,
              ].join("\n"),
            },
          ],
        });
        responses.push(repair);
        text = mergeSymbolicSections(input.productKey, headings, responses.map((response) => response.text));
        issue = symbolicQualityIssue({ productKey: input.productKey, text, cards, wheel, chart: hdChart, surname: surnameStory, numerology });
      }
    } else {
      const response = await aiComplete({
        feature,
        userId: input.userId,
        requestId: segmentedRequestId(input.requestId, "full"),
        maxTokens: SYMBOLIC_MAX_TOKENS[input.productKey] ?? 1400,
        temperature: 0.5,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContext },
        ],
      });
      responses.push(response);
      text = normalizeResult(response.text);
    }

    const qualityIssue = symbolicQualityIssue({ productKey: input.productKey, text, cards, wheel, chart: hdChart, surname: surnameStory, numerology });
    if (qualityIssue) {
      log.warn("symbolic-product-quality-failed", {
        requestId: input.requestId,
        productKey: input.productKey,
        qualityIssue,
        resultLength: text.length,
      });
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: `quality_failed:${qualityIssue}`, ...cardsMeta } };
    }

    const primaryResponse = responses[0];

    return {
      text,
      metadata: {
        source: "ai",
        provider: primaryResponse.provider,
        model: primaryResponse.model,
        providers: [...new Set(responses.map((response) => response.provider))],
        models: [...new Set(responses.map((response) => response.model))],
        generationParts: responses.length,
        tokensIn: responses.reduce((sum, response) => sum + response.tokensIn, 0),
        tokensOut: responses.reduce((sum, response) => sum + response.tokensOut, 0),
        latencyMs: responses.reduce((sum, response) => sum + response.latencyMs, 0),
        ...cardsMeta,
      },
    };
  } catch (error) {
    log.warn("symbolic-product-fallback", {
      requestId: input.requestId,
      productKey: input.productKey,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error", ...cardsMeta } };
  }
}
