import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import { buildNatalWheel } from "@/lib/esoteric-chart";
import { computeHumanDesignFromText } from "@/lib/human-design";
import type { HumanDesignChart } from "@/lib/human-design-data";
import { analyzeSurname, surnameFactsForAI, type SurnameStory } from "@/lib/surname-story";
import { log, serializeError } from "@/lib/logger";

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

// #12: a real Таро spread. The result (and its visual on the page) must reflect
// actual drawn cards from a complete 78-card deck, not a hardcoded example.
export type TarotDeckCard = {
  code: string;
  name: string;
  arcana: "major" | "minor";
  glyph: string;
  suit?: string;
  rank?: string;
  upright: string;
  reversedMeaning: string;
};
export type TarotCard = TarotDeckCard & {
  position: string;
  meaning: string;
  uprightMeaning: string;
  reversedMeaning: string;
  reversed: boolean;
};
export type TarotSpreadKey = "focus" | "three" | "choice" | "relationship" | "celtic";

export const TAROT_SPREAD_PRESETS: Record<TarotSpreadKey, {
  key: TarotSpreadKey;
  label: string;
  positions: readonly string[];
}> = {
  focus: {
    key: "focus",
    label: "1 карта",
    positions: ["Фокус"],
  },
  three: {
    key: "three",
    label: "3 карты",
    positions: ["Прошлое", "Настоящее", "Будущее"],
  },
  choice: {
    key: "choice",
    label: "Выбор",
    positions: ["Вариант 1", "Вариант 2", "Что важно знать"],
  },
  relationship: {
    key: "relationship",
    label: "Отношения",
    positions: ["Вы", "Другой человек", "Потенциал связи", "Совет", "Возможный итог"],
  },
  celtic: {
    key: "celtic",
    label: "Кельтский крест",
    positions: ["Сейчас", "Вызов", "Прошлое", "Будущее", "Цель", "Основа", "Совет", "Внешнее", "Надежды и страхи", "Итог"],
  },
};

const TAROT_MAJOR_ARCANA: TarotDeckCard[] = [
  { code: "major-00", name: "Шут", arcana: "major", glyph: "0", upright: "новое начало, доверие пути", reversedMeaning: "неосторожность, импульс без опоры" },
  { code: "major-01", name: "Маг", arcana: "major", glyph: "I", upright: "воля и ресурсы уже под рукой", reversedMeaning: "рассеянность, ресурс используется не туда" },
  { code: "major-02", name: "Верховная Жрица", arcana: "major", glyph: "II", upright: "интуиция, тихое знание", reversedMeaning: "закрытость, трудность услышать себя" },
  { code: "major-03", name: "Императрица", arcana: "major", glyph: "III", upright: "забота, рост, плодородие", reversedMeaning: "истощение заботой, нехватка питания" },
  { code: "major-04", name: "Император", arcana: "major", glyph: "IV", upright: "опора, структура, границы", reversedMeaning: "жёсткость, контроль вместо опоры" },
  { code: "major-05", name: "Иерофант", arcana: "major", glyph: "V", upright: "опыт, традиция, наставник", reversedMeaning: "чужое правило, которое пора проверить" },
  { code: "major-06", name: "Влюблённые", arcana: "major", glyph: "VI", upright: "выбор сердца и ценностей", reversedMeaning: "расхождение ценностей, избегание выбора" },
  { code: "major-07", name: "Колесница", arcana: "major", glyph: "VII", upright: "движение к цели, собранность", reversedMeaning: "рывок без направления, усталость от контроля" },
  { code: "major-08", name: "Сила", arcana: "major", glyph: "VIII", upright: "мягкая стойкость", reversedMeaning: "самодавление, сила без нежности" },
  { code: "major-09", name: "Отшельник", arcana: "major", glyph: "IX", upright: "пауза, поиск ответа внутри", reversedMeaning: "изоляция, одиночество вместо ответа" },
  { code: "major-10", name: "Колесо Фортуны", arcana: "major", glyph: "X", upright: "перемена, новый цикл", reversedMeaning: "сопротивление перемене, повтор старого круга" },
  { code: "major-11", name: "Справедливость", arcana: "major", glyph: "XI", upright: "честность и последствия", reversedMeaning: "искажение баланса, уход от ответственности" },
  { code: "major-12", name: "Повешенный", arcana: "major", glyph: "XII", upright: "смена угла зрения", reversedMeaning: "застревание, ожидание без смысла" },
  { code: "major-13", name: "Смерть", arcana: "major", glyph: "XIII", upright: "завершение и переход", reversedMeaning: "цепляние за то, что уже ушло" },
  { code: "major-14", name: "Умеренность", arcana: "major", glyph: "XIV", upright: "баланс и мера", reversedMeaning: "перекос, отсутствие внутренней настройки" },
  { code: "major-15", name: "Дьявол", arcana: "major", glyph: "XV", upright: "привязанность, что держит", reversedMeaning: "осознание зависимости, шанс вернуть свободу" },
  { code: "major-16", name: "Башня", arcana: "major", glyph: "XVI", upright: "слом иллюзии, освобождение", reversedMeaning: "страх перемен, отсроченное признание правды" },
  { code: "major-17", name: "Звезда", arcana: "major", glyph: "XVII", upright: "надежда и восстановление", reversedMeaning: "сомнение в поддержке, потеря ориентира" },
  { code: "major-18", name: "Луна", arcana: "major", glyph: "XVIII", upright: "туман, тревога, образы", reversedMeaning: "прояснение страха, выход из самообмана" },
  { code: "major-19", name: "Солнце", arcana: "major", glyph: "XIX", upright: "свет, тепло, радость", reversedMeaning: "приглушённая радость, потребность в простоте" },
  { code: "major-20", name: "Суд", arcana: "major", glyph: "XX", upright: "пробуждение, честный итог", reversedMeaning: "самокритика, отказ услышать внутренний зов" },
  { code: "major-21", name: "Мир", arcana: "major", glyph: "XXI", upright: "целостность, завершение круга", reversedMeaning: "незавершённость, последняя деталь перед итогом" },
];

const TAROT_MINOR_SUITS: Array<{ suit: string; glyph: string; theme: string }> = [
  { suit: "Жезлы", glyph: "Ж", theme: "действие, импульс, направление" },
  { suit: "Кубки", glyph: "К", theme: "чувства, связь, внутренний отклик" },
  { suit: "Мечи", glyph: "М", theme: "мысль, слова, различение и конфликт" },
  { suit: "Пентакли", glyph: "П", theme: "тело, быт, деньги и устойчивость" },
];

const TAROT_MINOR_RANKS: Array<{ rank: string; upright: string; reversedMeaning: string }> = [
  { rank: "Туз", upright: "начало энергии и новый импульс", reversedMeaning: "задержка старта, сомнение в импульсе" },
  { rank: "Двойка", upright: "выбор, баланс двух сил", reversedMeaning: "колебание, трудность удержать равновесие" },
  { rank: "Тройка", upright: "рост, первые результаты, расширение", reversedMeaning: "разрозненность, рост без согласования" },
  { rank: "Четвёрка", upright: "стабильность, пауза, опора", reversedMeaning: "застой, слишком тесная рамка" },
  { rank: "Пятёрка", upright: "напряжение, урок через конфликт", reversedMeaning: "выход из борьбы, усталость спорить" },
  { rank: "Шестёрка", upright: "восстановление, помощь, движение дальше", reversedMeaning: "застревание в прошлом, помощь не принята" },
  { rank: "Семёрка", upright: "испытание, выбор позиции, защита своего", reversedMeaning: "сомнение, перегруз защитой" },
  { rank: "Восьмёрка", upright: "движение, навык, концентрация", reversedMeaning: "спешка или повтор без смысла" },
  { rank: "Девятка", upright: "зрелость опыта, внутренняя проверка", reversedMeaning: "перенапряжение, ожидание подвоха" },
  { rank: "Десятка", upright: "итог цикла, полнота темы", reversedMeaning: "перегруз завершением, лишний груз" },
  { rank: "Паж", upright: "весть, ученик, любопытство", reversedMeaning: "незрелый сигнал, поспешные выводы" },
  { rank: "Рыцарь", upright: "движение, стремление, активный шаг", reversedMeaning: "крайность, суета или рывок без меры" },
  { rank: "Королева", upright: "зрелое принятие и внутренняя власть", reversedMeaning: "закрытость, контроль через заботу" },
  { rank: "Король", upright: "мастерство, ответственность, ясная форма", reversedMeaning: "жёсткое управление, страх потерять контроль" },
];

export const TAROT_DECK: TarotDeckCard[] = [
  ...TAROT_MAJOR_ARCANA,
  ...TAROT_MINOR_SUITS.flatMap((suit) => TAROT_MINOR_RANKS.map((rank, index) => ({
    code: `minor-${suit.glyph}-${index + 1}`,
    name: `${rank.rank} ${suit.suit}`,
    arcana: "minor" as const,
    suit: suit.suit,
    rank: rank.rank,
    glyph: suit.glyph,
    upright: `${rank.upright}; сфера: ${suit.theme}`,
    reversedMeaning: `${rank.reversedMeaning}; сфера: ${suit.theme}`,
  }))),
];

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
    return `## ${card.position}: ${card.name}${orientation}\n${card.reversed ? "Энергия карты приглушена или обращена внутрь: " : ""}${card.meaning}. Что из этого откликается в вашей ситуации прямо сейчас?`;
  });
  return [
    intro,
    context,
    ...lines,
    "## Бережный следующий шаг\nВыберите одну карту, которая зацепила сильнее всего, и сделайте один маленький шаг в её сторону на этой неделе.",
  ].filter(Boolean).join("\n\n");
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
    ?? "В вашем запросе уже видна одна тема, которую можно рассмотреть бережно и без фатальных обещаний.";

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
      "Полный разбор расшифрует ваши каналы, профиль и подскажет, как мягко жить по своей стратегии.",
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

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
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
      "Расклад Таро",
      "",
      "Прошлое — Жрица. Похоже, часть ответа вы уже слышали внутри, но пока не дали ей языка.",
      "Настоящее — Башня. Сейчас рушится не вся ситуация, а прежний способ держаться за неё.",
      "Возможное — Звезда. Самый бережный путь начинается с паузы и одного честного вопроса к себе.",
      "",
      "Практический шаг: запишите, что в этой ситуации является фактом, а что — образом страха. Карты не решают за вас; они помогают увидеть развилку.",
    ].join("\n");
  }
  if (input.productKey === "natal-chart") {
    return [
      "Натальная карта",
      "",
      "Этот разбор стоит читать как карту тем, а не как сценарий судьбы. В фокусе — где вам легче начинать, где нужна опора, и какой язык поддержки подходит именно вам.",
      "",
      "Акцент вопроса: сейчас важно не искать «правильный знак», а заметить, какую часть себя вы пытаетесь обойти ради внешнего спокойствия.",
    ].join("\n");
  }
  if (input.productKey === "numerology") {
    return [
      "Числовой портрет",
      "",
      "Числа здесь работают как короткий язык повторов. Один слой показывает, где вам нужна свобода движения, другой — где вы ищете тишину и смысл.",
      "",
      "Практический вопрос: где вы сейчас тратите силы против собственного ритма, а где энергия появляется почти сама?",
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
      "Бережный следующий шаг: выберите один сценарий, который вы НЕ хотите передавать дальше, и назовите, как он проявляется у вас сейчас.",
    ].join("\n");
  }
  return [
    "Символический разбор ETerapy",
    "",
    "Этот разбор — язык образов и тем, а не приговор. Мы смотрим, что в вашем запросе повторяется и просит больше внимания.",
    "",
    "Бережный следующий шаг: выберите одну тему из разбора и назовите один маленький шаг, который можно сделать на этой неделе.",
  ].join("\n");
}

// B387: факты рассчитанного чарта для AI, чтобы разбор опирался на реальный тип,
// а не выдумывал. Передаём в системный промт как «вот что точно посчитано».
function humanDesignFactsForAI(chart: HumanDesignChart): string {
  const defined = chart.centers.filter((c) => c.defined).map((c) => c.name).join(", ") || "нет определённых центров";
  const channels = chart.definedChannels.map((c) => `${c.gates[0]}-${c.gates[1]}`).join(", ") || "нет";
  return [
    "ТОЧНО РАССЧИТАНО (не меняй и не выдумывай эти факты):",
    `Тип: ${chart.typeName}. Стратегия: ${chart.strategy}. Внутренний авторитет: ${chart.authorityName}.`,
    `Профиль: ${chart.profile} (${chart.profileName}). Определение: ${chart.definition}.`,
    `Определённые центры: ${defined}.`,
    `Определённые каналы: ${channels}.`,
    `Подпись: ${chart.signature}. Тема не-я: ${chart.notSelf}.`,
    chart.hasExactTime ? "Указано точное время рождения." : "Время рождения не указано — считай тип как ориентир, мягко предложи уточнить время.",
    "Объясни ИМЕННО эти тип/стратегию/авторитет/профиль/каналы человеческим языком, без фатализма и без эзотерического жаргона как догмы.",
  ].join("\n");
}

function humanDesignFallback(chart: HumanDesignChart | null): string {
  if (!chart) {
    return [
      "Дизайн человека",
      "",
      "Чтобы посчитать тип точно, нужна дата рождения с годом, а лучше — точное время и город. Тип и бодиграф строятся по реальному положению светил в момент рождения.",
      "",
      "Бережный шаг: укажите данные рождения как можно точнее — и здесь появится ваш тип, стратегия и авторитет.",
    ].join("\n");
  }
  return [
    `Дизайн человека: ${chart.typeName}`,
    "",
    `Ваш тип — ${chart.typeName}. ${chart.typeSummary}`,
    "",
    `## Стратегия\n${chart.strategy}. Это не правило, а способ тратить меньше сил впустую.`,
    `## Внутренний авторитет\n${chart.authorityName}. ${chart.authorityHint}`,
    `## Профиль ${chart.profile} — ${chart.profileName}\nЭто язык того, как вы естественно учитесь и проявляетесь.`,
    "",
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
      "Бережный шаг: укажите фамилию, и здесь появится её короткая история и родовая тема для размышления.",
    ].join("\n");
  }
  return [
    `История фамилии: ${story.surname}`,
    "",
    `## Что говорит форма\n${story.originLabel}. ${story.originStory}`,
    story.rootHint ? `## Занятие предков\nВероятно, фамилия связана с ${story.rootHint}.` : "",
    story.regionHint ? `## География\nТакая форма ${story.regionHint}.` : "",
    `## Родовая тема\n${story.familyTheme}. Это тема для размышления, а не судьба и не приговор роду.`,
    "",
    "## Бережный вопрос к себе\nЧто из истории вашего рода вы хотели бы продолжить, а что — мягко оставить в прошлом?",
  ].filter(Boolean).join("\n");
}

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
  const tarotTheme = input.productKey === "tarot" ? normalize(input.tarotTheme ?? "").slice(0, 80) : "";
  const cards = input.productKey === "tarot"
    ? drawTarotSpread(`${input.userId}:${tarotSpread?.key}:${tarotTheme}:${normalize(input.userInput)}`, tarotSpread?.positions)
    : null;
  // B388: натальная карта получает детерминированное структурное колесо в metadata,
  // чтобы страница услуги и PDF рендерили визуал, совпадающий с интерпретацией.
  const wheel = input.productKey === "natal-chart" ? buildNatalWheel(normalize(input.userInput)) : null;
  // B387: «Дизайн человека» — детерминированный чарт по реальным эфемеридам;
  // храним в metadata (для бодиграфа на странице/в PDF) и передаём в AI как факты.
  const hdChart = input.productKey === "human-design" ? computeHumanDesignFromText(input.userInput).chart : null;
  // B391: распознанная форма фамилии — детерминированно; храним в metadata (для
  // страницы/PDF) и передаём в AI как факты, чтобы разбор не выдумывал этимологию.
  const surnameStory = input.productKey === "surname-story" ? analyzeSurname(input.userInput) : null;
  const visualMeta: Prisma.InputJsonObject = {
    ...(cards ? { cards: cards as unknown as Prisma.InputJsonValue } : {}),
    ...(tarotSpread ? { tarotSpread: { key: tarotSpread.key, label: tarotSpread.label, positions: [...tarotSpread.positions] } } : {}),
    ...(tarotTheme ? { tarotTheme } : {}),
    ...(wheel ? { wheel: wheel as unknown as Prisma.InputJsonValue } : {}),
    ...(hdChart ? { chart: hdChart as unknown as Prisma.InputJsonValue } : {}),
    ...(surnameStory ? { surname: surnameStory as unknown as Prisma.InputJsonValue } : {}),
  };
  const cardsMeta = visualMeta;
  const fallback = cards
    ? tarotReadingFromCards(cards, input.userInput, tarotSpread?.label, tarotTheme)
    : input.productKey === "human-design"
      ? humanDesignFallback(hdChart)
      : input.productKey === "surname-story"
        ? surnameStoryFallback(surnameStory)
        : heuristicSymbolicResult(input);

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
      ? `\n\nЭто расклад "${tarotSpread?.label ?? "Таро"}" из ${cards.length} карт (${cards.map((card) => card.position).join(" / ")}). Интерпретируй ИМЕННО выпавшие карты ниже, по одной секции на карту, в контексте реального вопроса пользователя${tarotTheme ? ` (мягкий фокус-оттенок: "${tarotTheme}" — не ограничение сферы вопроса)` : ""}.`
      : "";
    const hdNote = hdChart ? `\n\n${humanDesignFactsForAI(hdChart)}` : "";
    const surnameNote = surnameStory ? `\n\n${surnameFactsForAI(surnameStory)}` : "";

    const response = await aiComplete({
      feature,
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1400,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: baseSystemPrompt + tarotCardsNote + hdNote + surnameNote,
        },
        {
          role: "user",
          content: [
            `Product: ${definition?.title ?? input.productKey}`,
            tarotSpread ? `Расклад: ${tarotSpread.label}.` : "",
            tarotTheme ? `Мягкий фокус-оттенок (не ограничение сферы вопроса): ${tarotTheme}.` : "",
            cards ? `Выпавшие карты: ${cards.map((c) => `${c.position} — ${c.name}${c.reversed ? " (перевёрнутая)" : ""}`).join("; ")}.` : "",
            `User input: ${normalize(input.userInput) || "Пользователь хочет бережный символический разбор."}`,
          ].filter(Boolean).join("\n"),
        },
      ],
    });

    const text = normalize(response.text);
    if (text.length < 220) {
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: "short_ai_response", ...cardsMeta } };
    }

    return {
      text,
      metadata: {
        source: "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
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
