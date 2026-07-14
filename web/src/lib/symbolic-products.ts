import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import type { NatalWheel } from "@/lib/esoteric-chart";
import { buildNatalEphemerisWheel, textMentionsZodiacSign } from "@/lib/natal-ephemeris";
import { computeNumerology, numerologyFactsForAI, type NumerologyPortrait } from "@/lib/numerology";
import { parseStrictBirthDate } from "@/lib/destiny-matrix";
import { computeTarotBirthCode, type TarotBirthCode } from "@/lib/tarot-birth-code";
import { computeHoraryFacts, horaryFactsForAI } from "@/lib/horary";
import { computeHumanDesignFromText } from "@/lib/human-design";
import type { HumanDesignChart } from "@/lib/human-design-data";
import { humanDesignChannelHeading, humanDesignSectionHeadings } from "@/lib/human-design-result";
import {
  analyzeSurname,
  computeSurnameCode,
  parseSurnameAuditInput,
  surnameFactsForAI,
  surnameValueFromStructuredInput,
  type ParsedSurnameAuditInput,
  type SurnameCode,
  type SurnameStory,
} from "@/lib/surname-story";
import { log, serializeError } from "@/lib/logger";
import { normalizeResultSectionHeadings, splitSections } from "@/lib/report-sections";
import { TAROT_DECK, type TarotCard } from "@/lib/tarot-deck";
import { calculateNatalAspectLines } from "@/lib/astrology-aspects";

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
    title: "Матрица судьбы",
    promptLabel: "Имя и дата рождения",
    resultTitle: "Матрица судьбы: 22 энергии",
  },
  {
    productKey: "horary",
    title: "Хорарная астрология",
    promptLabel: "Один точный вопрос, место и момент фиксации",
    resultTitle: "Хорарная астрология: ответ карты момента",
  },
  {
    productKey: "tarot-numerology",
    title: "Арканы рождения",
    promptLabel: "Имя, дата рождения, фокус и вопрос",
    resultTitle: "Арканы рождения: ваши карты Таро по дате",
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
    // B515: «Кармический код фамилии». Число и Аркан считаются детерминированно;
    // генеративная часть объясняет ресурс, тень и прикладной сценарий, не меняя
    // видимую пользователю арифметику и не изобретая факты о предках.
    productKey: "surname-story",
    title: "Кармический код фамилии",
    promptLabel: "Фамилия и сценарий аудита",
    resultTitle: "Кармический аудит рода",
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
  if (input.productKey === "horary") {
    return ["Хорарная карта вопроса", firstMeaningfulLine, "", "Полный разбор откроет сигнификаторы, рецепции, препятствия, срок и условие изменения исхода."].join("\n");
  }
  if (input.productKey === "tarot-numerology") {
    return ["Один акцент Арканного кода", firstMeaningfulLine, "", "Полный разбор откроет шесть рассчитанных арканов, их противоречия и ответ по вашему вопросу."].join("\n");
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
    const story = analyzeSurname(surnameValueFromStructuredInput(input.userInput));
    return [
      story ? `Код фамилии ${story.code.baseNumber} · ${story.code.arcanaGlyph} ${story.code.arcanaName}` : "Код вашей фамилии",
      story ? `${story.code.letters.map((item) => `${item.letter}${item.value}`).join(" · ")} = ${story.code.sum}. Арканический индекс: ${story.code.arcanaIndex}.` : firstMeaningfulLine,
      "",
      "Полный аудит раскроет ресурс, тень, денежный сценарий, семейную роль и практики интеграции.",
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

function tarotBirthCodeFactsForAI(code: TarotBirthCode) {
  return [
    "ТОЧНО ПОСЧИТАНО ПО СИСТЕМЕ TAROT BIRTH CARDS (не меняй арканы):",
    ...code.positions.map((position) => `${position.label}: энергия ${position.energy}, ${position.card.name}; формула ${position.formula}.`),
    "Это существующая пара карт рождения по дате. Карты постоянны, не выпали случайно и не перевёрнуты. Используй только эти Старшие арканы и не добавляй годовую карту.",
  ].join("\n");
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
  const extended = (body: "chiron" | "lilith", label: string) => {
    const personality = chart.personality.find((activation) => activation.body === body);
    const design = chart.design.find((activation) => activation.body === body);
    return personality && design ? `${label}: Личность ${personality.gate}.${personality.line}; Дизайн ${design.gate}.${design.line}.` : "";
  };
  const column = (activations: HumanDesignChart["personality"]) => activations
    .map((activation) => `${activation.label} ${activation.gate}.${activation.line}`)
    .join("; ");
  const variable = (label: string, value: NonNullable<HumanDesignChart["variables"]>[keyof NonNullable<HumanDesignChart["variables"]>] | undefined) => value
    ? `${label}: Color ${value.color}, Tone ${value.tone}, ${value.direction === "left" ? "Left" : "Right"}.`
    : "";
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
    extended("chiron", "Хирон, NASA/JPL SBDB orbit 171"),
    extended("lilith", "Лилит, средний лунный апогей"),
    variable("Determination", chart.variables?.determination),
    variable("Environment", chart.variables?.environment),
    variable("Motivation", chart.variables?.motivation),
    variable("Perspective", chart.variables?.perspective),
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
  const defined = chart.centers.filter((center) => center.defined);
  const open = chart.centers.filter((center) => !center.defined);
  const channelSections = chart.definedChannels.flatMap((channel) => [
    `## ${humanDesignChannelHeading(channel.gates)}`,
    `Эта связь объединяет ${channel.centers.map((key) => chart.centers.find((center) => center.key === key)?.name).join(" и ")}. Её стоит наблюдать как устойчивую тему карты вместе со стратегией и авторитетом, а не как отдельный ярлык характера.`,
  ]);
  return [
    `## Тип — ${chart.typeName}`,
    `Ваш тип — ${chart.typeName}. ${chart.typeSummary}`,
    `## Стратегия — ${chart.strategy}`,
    `Ваша стратегия — ${chart.strategy.toLowerCase()}. Она описывает способ входить в решения с меньшим сопротивлением, а не обязанность или обещание результата.`,
    `## Авторитет — ${chart.authorityName}`,
    `${chart.authorityName}. ${chart.authorityHint}`,
    `## Профиль — ${chart.profile}: ${chart.profileName}`,
    `Профиль ${chart.profile} (${chart.profileName}) описывает естественный способ учиться, взаимодействовать и быть замеченным другими.`,
    `## Определение — ${chart.definition}`,
    `${chart.definition} показывает, как определённые центры связаны между собой в устойчивые контуры.`,
    `## Определённые центры — ${defined.length}`,
    `Определены: ${defined.map((center) => center.name).join(", ") || "нет"}. Здесь энергия и способ обработки опыта считаются более устойчивыми темами карты.`,
    `## Открытые центры — ${open.length}`,
    `Открыты: ${open.map((center) => center.name).join(", ") || "нет"}. Здесь особенно полезно различать собственный опыт и усиленное влияние среды.`,
    ...channelSections,
    `## Ворота — ${chart.activeGates.length} активных`,
    `Активные ворота: ${chart.activeGates.join(", ")}. Их смысл раскрывается вместе с центрами, линиями и полной конфигурацией карты.`,
    `## Тема не-я — ${chart.notSelf}; подпись — ${chart.signature}`,
    `«${chart.notSelf}» в этой системе читается как сигнал сопротивления; «${chart.signature}» — как ориентир согласованности с собой.`,
    `## Синтез — ${chart.typeName}, профиль ${chart.profile}`,
    `Главный практический порядок: сначала стратегия «${chart.strategy}», затем решения через авторитет «${chart.authorityName}». Профиль ${chart.profile} добавляет способ проживать этот процесс в отношениях и опыте.`,
    `## Практика — ${chart.strategy}; ${chart.authorityName}`,
    `Подпись «${chart.signature}» — знак, что вы живёте по себе; «${chart.notSelf.toLowerCase()}» — сигнал свернуть не туда. Это карта самопонимания, а не приговор.`,
  ].join("\n");
}

// B391: детерминированный фолбэк родового разбора по распознанной форме фамилии.
function surnameStoryFallback(story: SurnameStory | null): string {
  if (!story) {
    return [
      "Кармический код фамилии",
      "",
      "Чтобы рассчитать код, укажите фамилию кириллицей. Каждая буква получает значение от 1 до 9; из общей суммы отдельно получаются базовое число и индекс Старшего Аркана.",
      "",
      "После расчёта появятся формула, Аркан, ресурс, тень и практический маршрут.",
    ].join("\n");
  }
  return [
    "## Формула фамилии",
    `${story.code.letters.map((item) => `${item.letter}=${item.value}`).join(" + ")} = ${story.code.sum}. Базовое число: ${story.code.baseNumber}.`,
    `## Код рода — ${story.code.baseNumber}: ${story.code.arcanaName}`,
    `Арканический индекс ${story.code.arcanaIndex}, ${story.code.arcanaGlyph} «${story.code.arcanaName}». Внутренний код: ${story.code.innerNumber ?? "нет"}; внешний код: ${story.code.outerNumber ?? "нет"}.`,
    "## Что говорит форма фамилии",
    `${story.surname}: ${story.originLabel}. ${story.originStory}`,
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
  const aspects = calculateNatalAspectLines(wheel.placements)
    .sort((left, right) => left.aspect.orb - right.aspect.orb)
    .map((line, index) => `A${String(index + 1).padStart(2, "0")}: ${line.from.label} — ${line.to.label}, ${line.aspect.label.toLowerCase()}, орбис ${line.aspect.orb.toFixed(1)}°`)
    .join("; ");
  return [
    "ТОЧНО ПОСЧИТАНО ПО ЭФЕМЕРИДАМ (не меняй эти факты):",
    `Солнце в знаке ${wheel.sunSign.name} (${wheel.sunSign.glyph}). Стихия: ${wheel.sunSign.element}. Модальность: ${modality}. Полярность: ${polarity}.`,
    `Положения: ${placements}.`,
    `Мажорные аспекты: ${aspects || "нет аспектов в выбранных орбисах"}.`,
    wheel.ascendant && wheel.ascendantDegree !== null && wheel.ascendantDegree !== undefined
      ? `Асцендент: ${wheel.ascendantDegree.toFixed(1)}° ${wheel.ascendant.name}. Равнодомные куспиды: ${houses}.`
      : hasTime
        ? "Время рождения передано, но координаты города не распознаны: не утверждай конкретный ASC и дома. Все положения десяти планет рассчитаны точно и должны быть разобраны."
        : "Точное время рождения не указано: не утверждай конкретный ASC и дома. Положения десяти планет на полдень рассчитаны и должны быть разобраны с оговоркой только для быстро движущейся Луны.",
    "Каждый раздел связывай с этими конкретными положениями и ID аспектов. Не называй аспект, которого нет в списке. Не вставляй общие дисклеймеры в текст результата.",
  ].join("\n");
}

function numerologyMatches(text: string, portrait: NumerologyPortrait) {
  if (portrait.matrix) {
    const sections = new Map(splitSections(text).map((section) => [headingKey(section.title), section.body]));
    return portrait.matrix.zones.every((zone) => {
      const body = sections.get(headingKey(zone.title)) ?? "";
      return new RegExp(`(^|\\D)${zone.value}(\\D|$)`, "u").test(body);
    });
  }
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
  chart: HumanDesignChart | null;
  surname: SurnameStory | null;
  surnameAudit: ParsedSurnameAuditInput | null;
}): string[] | null {
  if (input.productKey === "tarot" && input.cards) {
    return [
      "Прямой ответ",
      "Картина расклада",
      ...input.cards.map((card) => `${card.position}: ${card.name}`),
      "Связь карт и скрытая линия",
      "Ответ расклада",
      "Вероятная динамика",
      "Предупреждение карт",
    ];
  }
  if (input.productKey === "natal-chart") {
    return ["Прямой ответ", "Паспорт карты", "Большая тройка", "Меркурий, Венера и Марс", "Юпитер и Сатурн", "Уран, Нептун и Плутон", "Дома и углы", "Доминирующие стихии и модальности", "Аспекты: главные ресурсы", "Аспекты: главные напряжения", "Любовь и близость", "Работа и реализация", "Внутренние противоречия карты", "Итог по вашему вопросу"];
  }
  if (input.productKey === "numerology" && input.numerology) {
    if (input.numerology.matrix) {
      return [
        "Прямой ответ",
        ...input.numerology.matrix.zones.map((zone) => zone.title),
        "Личное предназначение",
        "Родовое предназначение",
        "Духовное и высшее предназначение",
        "Мужская родовая линия",
        "Женская родовая линия",
        "Возрастные периоды",
        "Карта здоровья: Небо, Земля и Ключ",
        "Противоречия матрицы",
        "Итоговый синтез",
      ];
    }
    return [
      "Прямой ответ",
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
  if (input.productKey === "human-design" && input.chart) {
    return ["Прямой ответ", ...humanDesignSectionHeadings(input.chart)];
  }
  if (input.productKey === "surname-story") {
    const scenarioHeading = input.surnameAudit?.mode === "change"
      ? "Смена фамилии: что изменится"
      : input.surnameAudit?.mode === "alias"
        ? "Псевдоним или бренд: какой образ усиливается"
        : input.surnameAudit?.mode === "name"
          ? "Имя и фамилия: конфликт и усиление"
          : "Где искать ресурс рода";
    const codeHeading = input.surname
      ? `Код рода — ${input.surname.code.baseNumber}: ${input.surname.code.arcanaName}`
      : "Код рода и Аркан";
    return [
      "Прямой ответ",
      "Формула фамилии",
      codeHeading,
      "Главный ресурс рода",
      "Родовая тень",
      "Деньги и реализация",
      "Отношения, границы и семейная роль",
      "Что вы можете нести из семьи",
      "Что принадлежит вам, а не фамилии",
      scenarioHeading,
      "Практическая интеграция",
      "Ответ на ваш вопрос",
    ];
  }
  if (input.productKey === "horary") {
    return ["Прямой ответ", "Радикальность и можно ли судить вопрос", "Вы и ваш сигнификатор", "Предмет вопроса и его сигнификатор", "Луна как ход событий", "Главный сходящийся аспект", "Рецепции: желание и способность действовать", "Препятствия и скрытые условия", "Что поддерживает ответ", "Что ему противоречит", "Вероятный срок", "Что может изменить исход"];
  }
  if (input.productKey === "tarot-numerology") {
    return ["Прямой ответ", "Пара карт рождения", "Карта рождения", "Карта души", "Связь двух арканов", "Сильное проявление", "Теневая сторона", "Отношения", "Реализация и деньги", "Ответ по вашему вопросу"];
  }
  return null;
}

function headingKey(value: string) {
  return value
    .replace(/^[#*_`“”«»\s]+|[#*_`“”«»\s]+$/g, "")
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
    const normalized = normalizeResultSectionHeadings(
      productKey,
      normalizeResult(text).replace(/([^\n])\s+(##\s+)/g, "$1\n\n$2"),
    );
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
  surnameComparison: SurnameCode | null;
  surnameAudit: ParsedSurnameAuditInput | null;
  numerology: NumerologyPortrait | null;
}) {
  const minimumChars: Partial<Record<SymbolicProductKey, number>> = {
    tarot: input.cards && input.cards.length >= 10 ? 6_500 : input.cards?.length === 1 ? 2_000 : 3_000,
    "natal-chart": 5_500,
    numerology: 5_000,
    "human-design": 4_800,
    "surname-story": 5_000,
    horary: 5_500,
    "tarot-numerology": 6_000,
  };
  if (input.text.length < (minimumChars[input.productKey] ?? 500)) return "результат слишком короткий";
  if (/\b(?:пользователь|клиент|заявитель|испытуемый)\b/iu.test(input.text)) return "заказчик описан в третьем лице";
  if (input.productKey === "horary" && /\b(?:applying|separating|unknown|early|late|ordinary)\b/iu.test(input.text)) {
    return "в клиентский текст попали внутренние английские значения хорарного расчёта";
  }
  const requiredHeadings = symbolicSectionHeadings({
    productKey: input.productKey,
    cards: input.cards,
    numerology: input.numerology,
    chart: input.chart,
    surname: input.surname,
    surnameAudit: input.surnameAudit,
  }) ?? [];
  const parsedSections = splitSections(input.text);
  const actualHeadings = new Set(parsedSections.map((section) => headingKey(section.title)));
  const missingHeadings = requiredHeadings.filter((heading) => !actualHeadings.has(headingKey(heading)));
  if (missingHeadings.length > 0) return `нет обязательных разделов: ${missingHeadings.slice(0, 4).join(", ")}`;
  const sectionMinimum = input.productKey === "surname-story" ? 220 : 160;
  const weakSection = parsedSections.find((section) => (
    requiredHeadings.some((heading) => headingKey(heading) === headingKey(section.title))
    && headingKey(section.title) !== headingKey("Прямой ответ")
    && section.body.replace(/^#{1,6}\s*$/gmu, "").trim().length < sectionMinimum
  ));
  if (weakSection) return `неполный раздел ${weakSection.title}`;
  const directAnswer = parsedSections.find((section) => headingKey(section.title) === headingKey("Прямой ответ"));
  if (requiredHeadings.some((heading) => headingKey(heading) === headingKey("Прямой ответ")) && !directAnswer) return "нет прямого ответа";
  if (directAnswer && directAnswer.body.replace(/^#{1,6}\s*$/gmu, "").trim().length < 350) {
    return "неполный прямой ответ";
  }
  if (input.productKey === "numerology" && input.numerology && !numerologyMatches(input.text, input.numerology)) {
    return "числа в заголовках не совпадают с рассчитанным портретом";
  }
  if (input.productKey === "numerology" && input.numerology?.matrix) {
    const sections = new Map(splitSections(input.text).map((section) => [headingKey(section.title), section.body]));
    for (const zone of input.numerology.matrix.zones) {
      const body = sections.get(headingKey(zone.title)) ?? "";
      if (body.length < 650 || !/В плюсе/iu.test(body) || !/В минусе/iu.test(body) || !/Практик/iu.test(body)) {
        return `неполная расшифровка позиции ${zone.title}`;
      }
    }
  }
  if (input.productKey === "human-design" && input.chart) {
    if (
      !input.text.includes(input.chart.typeName)
      || !input.text.includes(input.chart.strategy)
      || !input.text.includes(input.chart.authorityName)
      || !input.text.includes(input.chart.profile)
      || !input.text.includes(input.chart.definition)
    ) return "интерпретация не цитирует ключевые рассчитанные значения бодиграфа";
  }
  if (input.productKey === "tarot" && input.cards) {
    const missingCard = input.cards.find((card) => !input.text.includes(card.name) || !input.text.includes(card.position));
    if (missingCard) return `нет трактовки карты ${missingCard.name} в позиции ${missingCard.position}`;
  }
  if (input.productKey === "natal-chart" && input.wheel) {
    const distinctSigns = [...new Set(input.wheel.placements.map((placement) => placement.signName))];
    if (distinctSigns.filter((sign) => textMentionsZodiacSign(input.text, sign)).length < Math.min(4, distinctSigns.length)) return "текст не опирается на рассчитанные положения планет";
    const exactAspects = calculateNatalAspectLines(input.wheel.placements)
      .sort((left, right) => left.aspect.orb - right.aspect.orb)
      .slice(0, 3);
    const citedAspects = exactAspects.filter((line) => input.text.includes(line.from.label) && input.text.includes(line.to.label));
    if (exactAspects.length > 0 && citedAspects.length < Math.min(2, exactAspects.length)) return "текст не цитирует рассчитанные аспекты";
  }
  if (input.productKey === "surname-story" && input.surname && !input.text.includes(input.surname.surname)) return "текст не называет исследуемую фамилию";
  if (input.productKey === "surname-story" && input.surname) {
    const code = input.surname.code;
    if (!input.text.includes(String(code.sum)) || !input.text.includes(code.arcanaName)) return "текст меняет или не цитирует рассчитанный код фамилии";
    if (/\b(?:бережн\w*|мягко исслед\w*|ответ находится внутри|вы уже достаточно)\b/iu.test(input.text)) return "текст сглаживает прямой эзотерический разбор";
    if (/\b(?:проклят\w*|порч\w*|финансовый потолок|обреч[её]н\w*)\b/iu.test(input.text)) return "текст выдаёт запугивание или финансовый предел за факт";
    const richHeadings = ["Главный ресурс рода", "Родовая тень", "Деньги и реализация", "Отношения, границы и семейная роль"];
    const sections = new Map(parsedSections.map((section) => [headingKey(section.title), section.body]));
    for (const heading of richHeadings) {
      const body = sections.get(headingKey(heading)) ?? "";
      if (body.length < 500 || !/В плюсе/iu.test(body) || !/В минусе/iu.test(body) || !/Как проверить у себя/iu.test(body) || !/Практик/iu.test(body)) {
        return `неполная расшифровка слоя ${heading}`;
      }
    }
    if (input.surnameComparison && (
      !input.text.includes(input.surnameComparison.source)
      || !input.text.includes(input.surnameComparison.arcanaName)
      || !input.text.includes(String(input.surnameComparison.sum))
    )) return "сравнение не цитирует второй рассчитанный вариант";
  }
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
  horary: 7000,
  "tarot-numerology": 7000,
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
  const horaryWheel = input.productKey === "horary"
    ? (() => {
      try { return buildNatalEphemerisWheel(normalizeInput(input.userInput)); } catch { return null; }
    })()
    : null;
  const horaryFutureWheel = input.productKey === "horary" ? (() => {
    try {
      const iso = input.userInput.match(/Момент фиксации UTC:\s*(\d{4}-\d{2}-\d{2}T[^\s]+)/u)?.[1];
      if (!iso) return null;
      const future = new Date(new Date(iso).getTime() + 10 * 60_000).toISOString();
      return buildNatalEphemerisWheel(input.userInput.replace(iso, future));
    } catch { return null; }
  })() : null;
  const horary = horaryWheel ? (() => { try { return computeHoraryFacts(horaryWheel, input.userInput, horaryFutureWheel); } catch { return null; } })() : null;
  // B387: «Дизайн человека» — детерминированный чарт по реальным эфемеридам;
  // храним в metadata (для бодиграфа на странице/в PDF) и передаём в AI как факты.
  const hdChart = input.productKey === "human-design" ? computeHumanDesignFromText(input.userInput).chart : null;
  // B391: распознанная форма фамилии — детерминированно; храним в metadata (для
  // страницы/PDF) и передаём в AI как факты, чтобы разбор не выдумывал этимологию.
  const surnameInput = surnameValueFromStructuredInput(input.userInput);
  const surnameAudit = input.productKey === "surname-story" ? parseSurnameAuditInput(input.userInput) : null;
  const surnameStoryBase = input.productKey === "surname-story" ? analyzeSurname(surnameInput) : null;
  const surnamePrimaryCode = input.productKey === "surname-story"
    ? computeSurnameCode(surnameAudit?.surname || surnameInput)
    : null;
  const surnameStory = surnameStoryBase && surnamePrimaryCode
    ? { ...surnameStoryBase, surname: surnamePrimaryCode.source, code: surnamePrimaryCode }
    : surnameStoryBase;
  const surnameComparison = input.productKey === "surname-story" && surnameAudit?.comparison
    ? computeSurnameCode(surnameAudit.comparison)
    : null;
  // B451: числовой портрет — детерминированные ядровые числа (для визуала и фактов AI).
  const numerology = input.productKey === "numerology" ? computeNumerology(input.userInput) : null;
  const tarotBirthDate = input.productKey === "tarot-numerology" ? parseStrictBirthDate(input.userInput) : null;
  const tarotBirthCode = tarotBirthDate ? computeTarotBirthCode(tarotBirthDate.day, tarotBirthDate.month, tarotBirthDate.year) : null;
  const visualMeta: Prisma.InputJsonObject = {
    ...(cards ? { cards: cards as unknown as Prisma.InputJsonValue } : {}),
    ...(tarotSpread ? { tarotSpread: { key: tarotSpread.key, label: tarotSpread.label, positions: [...tarotSpread.positions] } } : {}),
    ...(tarotTheme ? { tarotTheme } : {}),
    ...(wheel ? { wheel: wheel as unknown as Prisma.InputJsonValue } : {}),
    ...(wheel ? { aspects: calculateNatalAspectLines(wheel.placements).map((line) => ({
      from: line.from.luminary,
      to: line.to.luminary,
      kind: line.aspect.kind,
      label: line.aspect.label,
      orb: line.aspect.orb,
    })) as unknown as Prisma.InputJsonValue } : {}),
    ...(hdChart ? { chart: hdChart as unknown as Prisma.InputJsonValue } : {}),
    ...(surnameStory ? { surname: surnameStory as unknown as Prisma.InputJsonValue } : {}),
    ...(surnameComparison ? { surnameComparison: surnameComparison as unknown as Prisma.InputJsonValue } : {}),
    ...(surnameAudit ? { surnameAudit: surnameAudit as unknown as Prisma.InputJsonValue } : {}),
    ...(numerology ? { numerology: numerology as unknown as Prisma.InputJsonValue } : {}),
    ...(horaryWheel ? { wheel: horaryWheel as unknown as Prisma.InputJsonValue } : {}),
    ...(horary ? { horary: horary as unknown as Prisma.InputJsonValue } : {}),
    ...(tarotBirthCode ? { tarotBirthCode: tarotBirthCode as unknown as Prisma.InputJsonValue } : {}),
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
  if (input.productKey === "horary" && (!horaryWheel || !horary)) {
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "question_moment_not_calculable", ...cardsMeta } };
  }
  if (input.productKey === "tarot-numerology" && !tarotBirthCode) {
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
    const surnameNote = surnameStory ? `\n\n${surnameFactsForAI(surnameStory, surnameComparison, surnameAudit ?? undefined)}` : "";
    const natalNote = wheel ? `\n\n${natalFactsForAI(wheel, normalizeInput(input.userInput))}` : "";
    const numeroNote = numerology ? `\n\n${numerologyFactsForAI(numerology)}` : "";
    const horaryNote = horaryWheel && horary ? `\n\n${natalFactsForAI(horaryWheel, normalizeInput(input.userInput))}\n\n${horaryFactsForAI(horary)}` : "";
    const tarotBirthNote = tarotBirthCode ? `\n\n${tarotBirthCodeFactsForAI(tarotBirthCode)}` : "";

    const systemPrompt = baseSystemPrompt + tarotCardsNote + hdNote + surnameNote + natalNote + numeroNote + horaryNote + tarotBirthNote;
    const userContext = [
      `Услуга: ${definition?.title ?? input.productKey}.`,
      tarotSpread ? `Расклад: ${tarotSpread.label}.` : "",
      tarotTheme ? `Тематический фокус: ${tarotTheme}.` : "",
      cards ? `Выпавшие карты: ${cards.map((card) => `${card.position} — ${card.name}${card.reversed ? " (перевёрнутая)" : ""}`).join("; ")}.` : "",
      `Данные для разбора: ${normalizeInput(input.userInput) || "Нужен полный персональный разбор."}`,
    ].filter(Boolean).join("\n");
    const headings = symbolicSectionHeadings({ productKey: input.productKey, cards, numerology, chart: hdChart, surname: surnameStory, surnameAudit });
    const responses = [] as Awaited<ReturnType<typeof aiComplete>>[];
    let text = "";

    if (headings && headings.length > 1) {
      const chunkHeadings = (items: string[], size: number) => Array.from(
        { length: Math.ceil(items.length / size) },
        (_, index) => items.slice(index * size, (index + 1) * size),
      );
      const matrixZoneHeadings = numerology?.matrix?.zones.map((zone) => zone.title) ?? [];
      const groups = input.productKey === "numerology" && matrixZoneHeadings.length > 0
        ? [
            ["Прямой ответ"],
            ...chunkHeadings(matrixZoneHeadings, 2),
            ...chunkHeadings(
              headings.filter((heading) => heading !== "Прямой ответ" && !matrixZoneHeadings.includes(heading)),
              3,
            ),
          ]
        : chunkHeadings(headings, input.productKey === "tarot" ? 2 : 3);
      const natalAspectPairs = wheel
        ? calculateNatalAspectLines(wheel.placements)
            .sort((left, right) => left.aspect.orb - right.aspect.orb)
            .slice(0, 3)
            .map((line) => `${line.from.label} — ${line.to.label}: ${line.aspect.label.toLowerCase()}, орбис ${line.aspect.orb.toFixed(1)}°`)
        : [];
      const generateSegment = (group: string[], index: number, repair = false) => aiComplete({
        feature,
        userId: input.userId,
        requestId: segmentedRequestId(input.requestId, `part-${index + 1}${repair ? "-repair" : ""}`),
        maxTokens: SYMBOLIC_MAX_TOKENS[input.productKey] ?? 1400,
        temperature: repair ? 0.3 : 0.45,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              repair
                ? "Предыдущая часть пропустила обязательный заголовок. Перепиши эту часть полностью и верни ВСЕ перечисленные разделы."
                : "Собери одну часть большого результата. Верни ТОЛЬКО перечисленные ниже разделы и не добавляй остальные.",
              "Каждый заголовок напиши дословно с `##`; внутри дай 3 содержательных абзаца по конкретным фактам, без вступления и заключения вне разделов.",
              group.includes("Прямой ответ")
                ? "Раздел `## Прямой ответ` должен содержать минимум 500 знаков и 2–3 законченных абзаца. Если явного вопроса нет, дайте прямой персональный вывод по выбранной сфере; нельзя оставлять пустой подзаголовок или служебные `###`."
                : "",
              input.productKey === "numerology" && group.some((heading) => matrixZoneHeadings.includes(heading))
                ? "Для КАЖДОГО позиционного раздела дай не менее 900 знаков и обязательно сохрани подзаголовки `### В плюсе`, `### В минусе`, `### Практики`. Не сокращай одну позицию ради другой."
                : "",
              input.productKey === "surname-story" && group.some((heading) => ["Главный ресурс рода", "Родовая тень", "Деньги и реализация", "Отношения, границы и семейная роль"].includes(heading))
                ? "Для КАЖДОГО смыслового слоя дай не менее 700 знаков и обязательно используй подзаголовки `### В плюсе`, `### В минусе`, `### Как проверить у себя`, `### Практики`. Пиши прямо, через наблюдаемое поведение и его цену; не утешай автоматически."
                : "",
              input.productKey === "surname-story" && surnameComparison && group.some((heading) => /Смена фамилии|Псевдоним или бренд/u.test(heading))
                ? `Сравни оба рассчитанных варианта: ${surnameStory?.surname} → ${surnameComparison.source}. Назови, что усиливается, что ослабевает, что остаётся с человеком и какова цена перехода. Не обещай причинно изменить доход, характер или судьбу.`
                : "",
              input.productKey === "natal-chart" && group.some((heading) => heading.startsWith("Аспекты:"))
                ? `В главах аспектов дословно назови и истолкуй минимум две рассчитанные пары: ${natalAspectPairs.join("; ")}.`
                : "",
              ...group.map((heading) => `## ${heading}`),
              userContext,
            ].join("\n"),
          },
        ],
      });
      const parts = await Promise.all(groups.map((group, index) => generateSegment(group, index)));
      responses.push(...parts);
      const segmentRepairs = await Promise.all(groups.map((group, index) => {
        const assembled = mergeSymbolicSections(input.productKey, group, [parts[index].text]);
        return group.every((heading) => assembled.includes(`## ${heading}`))
          ? null
          : generateSegment(group, index, true);
      }));
      responses.push(...segmentRepairs.filter((response): response is Awaited<ReturnType<typeof aiComplete>> => Boolean(response)));
      text = mergeSymbolicSections(input.productKey, headings, responses.map((response) => response.text));

      let issue = symbolicQualityIssue({ productKey: input.productKey, text, cards, wheel, chart: hdChart, surname: surnameStory, surnameComparison, surnameAudit, numerology });
      if (issue) {
        const actual = new Set(splitSections(text).map((section) => headingKey(section.title)));
        const missing = headings.filter((heading) => !actual.has(headingKey(heading)));
        const repairHeadings = input.productKey === "natal-chart" && issue.includes("аспект")
          ? ["Аспекты: главные ресурсы", "Аспекты: главные напряжения"]
          : [...missing, ...weakestSymbolicHeadings(headings, text)].filter((heading, index, all) => all.indexOf(heading) === index).slice(0, 6);
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
                repairHeadings.includes("Прямой ответ")
                  ? "Для `## Прямой ответ` дай минимум 500 знаков и прямой персональный вывод по вопросу или выбранной сфере; пустые подзаголовки запрещены."
                  : "",
                input.productKey === "numerology" && repairHeadings.some((heading) => matrixZoneHeadings.includes(heading))
                  ? "Каждый позиционный раздел должен содержать не менее 900 знаков и подзаголовки `### В плюсе`, `### В минусе`, `### Практики`."
                  : "",
                input.productKey === "surname-story" && repairHeadings.some((heading) => ["Главный ресурс рода", "Родовая тень", "Деньги и реализация", "Отношения, границы и семейная роль"].includes(heading))
                  ? "Каждый смысловой слой должен содержать не менее 700 знаков и подзаголовки `### В плюсе`, `### В минусе`, `### Как проверить у себя`, `### Практики`."
                  : "",
                input.productKey === "natal-chart" && issue.includes("аспект")
                  ? `Обязательно назови и истолкуй минимум две точные рассчитанные пары: ${natalAspectPairs.join("; ")}. Не заменяй их общими словами о гармонии или напряжении.`
                  : "",
                ...repairHeadings.map((heading) => `## ${heading}`),
                userContext,
              ].join("\n"),
            },
          ],
        });
        responses.push(repair);
        text = mergeSymbolicSections(input.productKey, headings, responses.map((response) => response.text));
        issue = symbolicQualityIssue({ productKey: input.productKey, text, cards, wheel, chart: hdChart, surname: surnameStory, surnameComparison, surnameAudit, numerology });
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

    const qualityIssue = symbolicQualityIssue({ productKey: input.productKey, text, cards, wheel, chart: hdChart, surname: surnameStory, surnameComparison, surnameAudit, numerology });
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
