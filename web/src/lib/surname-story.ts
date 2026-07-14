// B515 — «Кармический код фамилии». Calculation is deterministic and client-safe:
// a visible Cyrillic 1–9 ledger, a base code and a parallel 1–22 Major Arcana
// index. The LLM receives the finished calculation and may interpret it, but can
// never replace the arithmetic or invent genealogy.

export const SURNAME_CODE_METHOD = "eterapy-cyrillic-lineage-code-v1";

export type SurnameAuditMode = "resource" | "change" | "name" | "alias";

export type SurnameLetterValue = {
  letter: string;
  value: number;
  kind: "vowel" | "consonant" | "sign";
};

export type SurnameCode = {
  method: typeof SURNAME_CODE_METHOD;
  source: string;
  normalized: string;
  letters: SurnameLetterValue[];
  sum: number;
  baseNumber: number;
  innerNumber: number | null;
  outerNumber: number | null;
  arcanaIndex: number;
  arcanaName: string;
  arcanaGlyph: string;
};

export type ParsedSurnameAuditInput = {
  mode: SurnameAuditMode;
  name: string;
  surname: string;
  comparison: string;
  focus: string;
  context: string;
};

export type SurnameOriginKind =
  | "patronymic"   // -ов/-ев/-ин: от имени или прозвища предка
  | "locative"     // -ский/-цкий: «из местности» (иногда духовенство/шляхта)
  | "occupational" // корень-занятие: кузнец, мельник, гончар…
  | "west-slavic"  // -ко/-енко/-ук/-ович: украинские/белорусские/польские
  | "caucasian"    // -швили/-дзе/-ян: грузинские/армянские
  | "northern"     // -ых/-их: Русский Север и Сибирь
  | "descriptive"  // прозвище по черте характера/внешности
  | "unknown";

export type SurnameStory = {
  surname: string;
  code: SurnameCode;
  originKind: SurnameOriginKind;
  originLabel: string;
  originStory: string;
  regionHint: string | null;
  rootHint: string | null;
  familyTheme: string;
  shareLine: string;
  evidence?: {
    baseLexeme: string;
    dictionaryMeanings: string[];
    historicalMentions: string[];
    geography: string[];
    sourceNotes: string[];
  } | null;
};

const CYRILLIC_GROUPS = [
  "АИСЪ",
  "БЙТЫ",
  "ВКУЬ",
  "ГЛФЭ",
  "ДМХЮ",
  "ЕНЦЯ",
  "ЁОЧ",
  "ЖПШ",
  "ЗРЩ",
] as const;

const CYRILLIC_VALUE = new Map<string, number>(
  CYRILLIC_GROUPS.flatMap((letters, index) => [...letters].map((letter) => [letter, index + 1] as const)),
);

const ARCANA_1_TO_22 = [
  ["Маг", "I"],
  ["Верховная Жрица", "II"],
  ["Императрица", "III"],
  ["Император", "IV"],
  ["Иерофант", "V"],
  ["Влюблённые", "VI"],
  ["Колесница", "VII"],
  ["Сила", "VIII"],
  ["Отшельник", "IX"],
  ["Колесо Фортуны", "X"],
  ["Справедливость", "XI"],
  ["Повешенный", "XII"],
  ["Смерть", "XIII"],
  ["Умеренность", "XIV"],
  ["Дьявол", "XV"],
  ["Башня", "XVI"],
  ["Звезда", "XVII"],
  ["Луна", "XVIII"],
  ["Солнце", "XIX"],
  ["Суд", "XX"],
  ["Мир", "XXI"],
  ["Шут", "0 / XXII"],
] as const;

const VOWELS = new Set(["А", "Е", "Ё", "И", "О", "У", "Ы", "Э", "Ю", "Я"]);
const SIGNS = new Set(["Ъ", "Ь"]);

function digitalRoot(value: number) {
  return value > 0 ? 1 + ((value - 1) % 9) : 0;
}

export function computeSurnameCode(input: string): SurnameCode | null {
  const source = input.trim().replace(/\s+/gu, " ");
  const normalized = source.toLocaleUpperCase("ru").replace(/[^А-ЯЁ]/gu, "");
  const letters = [...normalized].flatMap<SurnameLetterValue>((letter) => {
    const value = CYRILLIC_VALUE.get(letter);
    if (!value) return [];
    return [{
      letter,
      value,
      kind: SIGNS.has(letter) ? "sign" : VOWELS.has(letter) ? "vowel" : "consonant",
    }];
  });
  if (letters.length < 2) return null;
  const sum = letters.reduce((total, item) => total + item.value, 0);
  const vowelSum = letters.filter((item) => item.kind === "vowel").reduce((total, item) => total + item.value, 0);
  const consonantSum = letters.filter((item) => item.kind === "consonant").reduce((total, item) => total + item.value, 0);
  const arcanaIndex = 1 + ((sum - 1) % 22);
  const [arcanaName, arcanaGlyph] = ARCANA_1_TO_22[arcanaIndex - 1];
  return {
    method: SURNAME_CODE_METHOD,
    source,
    normalized,
    letters,
    sum,
    baseNumber: digitalRoot(sum),
    innerNumber: vowelSum > 0 ? digitalRoot(vowelSum) : null,
    outerNumber: consonantSum > 0 ? digitalRoot(consonantSum) : null,
    arcanaIndex,
    arcanaName,
    arcanaGlyph,
  };
}

const KNOWN_SURNAME_STORIES: Record<string, Omit<SurnameStory, "surname" | "code">> = {
  "рукосуев": {
    originKind: "descriptive",
    originLabel: "Фамилия от мирского прозвища",
    originStory: "Фамилия образована от диалектного слова и мирского прозвища «рукосуй», а суффикс «-ев» закрепил значение принадлежности к носителю этого прозвища.",
    regionHint: "Сибирь и Забайкалье; ранние следы связаны с Енисейским уездом",
    rootHint: "диалектное прозвище «рукосуй»",
    familyTheme: "исследовательская линия — проследить сибирскую географию носителей и варианты написания в ревизских сказках и метрических книгах",
    shareLine: "Рукосуев — фамилия от диалектного мирского прозвища «рукосуй».",
    evidence: {
      baseLexeme: "рукосуй",
      dictionaryMeanings: [
        "тот, кто берёт или трогает чужие вещи без разрешения",
        "тот, кто вмешивается в чужие дела",
        "в забайкальских говорах — сумка или мешок нищего",
      ],
      historicalMentions: ["носители фамилии отмечены в документах Енисейского уезда с 1712 года"],
      geography: ["Красноярский край", "Иркутская область", "Забайкалье"],
      sourceNotes: [
        "лексема «рукосуй» зафиксирована в словарных справочных ресурсах",
        "ономастическая карточка Familio связывает фамилию с мирским прозвищем и документами Енисейского уезда",
      ],
    },
  },
};

const STOP_WORDS = new Set([
  "моя", "мой", "фамилия", "фамилии", "по", "отцу", "отца", "маме", "мамы", "матери",
  "девичья", "род", "рода", "это", "была", "был", "наша", "наш", "имя", "зовут",
]);

export function surnameValueFromStructuredInput(input: string) {
  return input.match(/^(?:Фамилия|Фамилия сейчас):\s*(.+)$/imu)?.[1]?.trim() ?? input;
}

export function parseSurnameAuditInput(input: string): ParsedSurnameAuditInput {
  const modeValue = input.match(/^Режим:\s*(.+)$/imu)?.[1]?.trim();
  const mode: SurnameAuditMode = modeValue === "change" || modeValue === "name" || modeValue === "alias"
    ? modeValue
    : "resource";
  return {
    mode,
    name: input.match(/^Имя:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    surname: surnameValueFromStructuredInput(input),
    comparison: input.match(/^(?:Новая фамилия|Новый вариант|Второй вариант):\s*(.+)$/imu)?.[1]?.trim() ?? "",
    focus: input.match(/^Фокус:\s*(.+)$/imu)?.[1]?.trim() ?? "",
    context: input.match(/^(?:Контекст|Вопрос):\s*(.+)$/imu)?.[1]?.trim() ?? "",
  };
}

// Достать фамилию из свободного ввода: кириллическое слово длиной ≥3, не стоп-слово.
// Сперва ищем токен с узнаваемым фамильным суффиксом, иначе — самый длинный токен.
export function parseSurnameInput(raw: string): string | null {
  const tokens = (raw || "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && /[а-яёА-ЯЁ]/.test(t) && !STOP_WORDS.has(t.toLowerCase()));

  if (tokens.length === 0) return null;

  const looksLikeSurname = (t: string) => detectOriginKind(t.toLowerCase()).kind !== "unknown";
  const candidate = tokens.find(looksLikeSurname) ?? tokens.sort((a, b) => b.length - a.length)[0];
  return titleCase(candidate);
}

function titleCase(word: string): string {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

// Распознанные корни-занятия (подстрока в основе фамилии). Список намеренно
// небольшой и достоверный — лучше честно сказать «форма», чем выдумывать.
const OCCUPATION_ROOTS: Array<{ root: string; label: string; theme: string }> = [
  { root: "кузнец", label: "кузнечного дела", theme: "ремесло и труд руками: предки умели создавать нужное другим" },
  { root: "ковал", label: "кузнечного дела", theme: "ремесло и труд руками: предки умели создавать нужное другим" },
  { root: "мельник", label: "мельничного дела", theme: "терпеливый труд и забота о хлебе насущном" },
  { root: "мельн", label: "мельничного дела", theme: "терпеливый труд и забота о хлебе насущном" },
  { root: "гончар", label: "гончарного ремесла", theme: "умение из простого материала делать красивое и полезное" },
  { root: "рыбак", label: "рыбного промысла", theme: "связь с водой, терпение и умение ждать" },
  { root: "пастух", label: "пастушьего дела", theme: "ответственность за тех, кто рядом, и связь с землёй" },
  { root: "ткач", label: "ткацкого ремесла", theme: "усидчивость и умение соединять нити в целое" },
  { root: "плотник", label: "плотницкого дела", theme: "умение строить опору — буквально и в жизни" },
  { root: "плотн", label: "плотницкого дела", theme: "умение строить опору — буквально и в жизни" },
  { root: "сапож", label: "сапожного ремесла", theme: "забота о пути других: предки помогали людям идти дальше" },
  { root: "портн", label: "портняжного дела", theme: "внимание к деталям и умение подогнать под человека" },
  { root: "мясник", label: "мясного промысла", theme: "практичность и умение обеспечить семью" },
  { root: "поп", label: "духовного сословия", theme: "слово, утешение и опора для других" },
  { root: "пономар", label: "церковного причта", theme: "служение, порядок и связь с традицией" },
  { root: "бондар", label: "бондарного ремесла", theme: "умение собирать прочное из отдельных частей" },
  { root: "пекар", label: "пекарного дела", theme: "ранний труд и забота о тепле и сытости близких" },
  { root: "столяр", label: "столярного дела", theme: "точность рук и любовь к завершённой работе" },
  { root: "пивовар", label: "пивоварного дела", theme: "терпение к процессу, который нельзя ускорить" },
];

type OriginDetection = { kind: SurnameOriginKind; label: string; story: string; region: string | null };

function detectOriginKind(lower: string): OriginDetection {
  const endsWith = (...suffixes: string[]) => suffixes.some((s) => lower.endsWith(s));

  if (endsWith("швили", "дзе", "иани", "ури", "ава")) {
    return { kind: "caucasian", label: "Грузинская фамилия", story: "Форма указывает на грузинские корни: «-швили» означает «дитя», «-дзе» — «сын».", region: "Грузия и Кавказ" };
  }
  if (endsWith("ян", "янц", "уни")) {
    return { kind: "caucasian", label: "Армянская фамилия", story: "Окончание «-ян» — классический признак армянских фамилий, означает принадлежность роду.", region: "Армения и Кавказ" };
  }
  if (endsWith("ович", "евич", "ич") && lower.length > 5) {
    return { kind: "west-slavic", label: "Отчественная фамилия", story: "Форма «-ович/-ич» происходит от отчества и распространена у белорусов, поляков и южных славян.", region: "Беларусь, Польша, Балканы" };
  }
  if (endsWith("ский", "цкий", "ская", "цкая", "ска")) {
    return { kind: "locative", label: "Локативная фамилия", story: "Окончание «-ский» чаще всего означало «из такой-то местности», иногда — принадлежность к духовенству или шляхте.", region: "часто связана с местностью или духовным сословием" };
  }
  if (endsWith("енко", "ко")) {
    return { kind: "west-slavic", label: "Украинская фамилия", story: "Суффикс «-ко/-енко» — характерный украинский, изначально уменьшительный («сын такого-то»).", region: "Украина и юг" };
  }
  if (endsWith("ук", "юк", "чук")) {
    return { kind: "west-slavic", label: "Западнославянская фамилия", story: "Окончание «-ук/-чук» означало «потомок» и распространено на западе Украины и в Беларуси.", region: "Западная Украина, Беларусь" };
  }
  if (endsWith("ых", "их")) {
    return { kind: "northern", label: "Северная фамилия", story: "Форма «-ых/-их» — старинная, отвечала на вопрос «чьих будете», характерна для Русского Севера и Сибири.", region: "Русский Север и Сибирь" };
  }
  if (endsWith("ов", "ев", "ёв", "ова", "ева", "ёва")) {
    return { kind: "patronymic", label: "Патронимическая фамилия", story: "Самый распространённый русский тип: фамилия образована от имени или прозвища предка по мужской линии.", region: "по всей России" };
  }
  if (endsWith("ин", "ын", "ина", "ына")) {
    return { kind: "patronymic", label: "Патронимическая фамилия", story: "Образована от имени, прозвища или занятия предка; «-ин» часто шло от слов на «-а/-я».", region: "по всей России" };
  }
  return { kind: "unknown", label: "Фамилия со своей историей", story: "Точную форму определить сложно — у каждой фамилии свой путь через поколения.", region: null };
}

function stemOf(lower: string): string {
  return lower.replace(/(ов|ев|ёв|ова|ева|ёва|ин|ын|ина|ына|ский|цкий|ская|цкая|енко|ко|ук|юк|чук|ых|их|ович|евич|ич)$/u, "");
}

function seededPick<T>(seed: string, items: readonly T[]): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return items[(h >>> 0) % items.length];
}

const THEME_BY_KIND: Record<SurnameOriginKind, readonly string[]> = {
  patronymic: [
    "связь с конкретным человеком в роду — предком, чьё имя вы носите каждый день",
    "наследование по мужской линии: возможно, в вашей семье важна преемственность",
  ],
  locative: [
    "связь с местом и корнями: предки определяли себя через землю, откуда они",
    "тема пути и принадлежности — «откуда я» как важный вопрос рода",
  ],
  occupational: ["труд и мастерство как опора рода"],
  "west-slavic": [
    "принадлежность роду и преемственность поколений",
    "тёплая связь с предками — фамилия буквально говорит «чей ты»",
  ],
  caucasian: [
    "сильная родовая принадлежность: фамилия прямо называет вас частью рода",
    "уважение к старшим и к памяти предков как опора",
  ],
  northern: [
    "общность и принадлежность семье, а не отдельному имени",
    "северная сдержанность и самостоятельность как родовая черта",
  ],
  descriptive: [
    "прозвище-черта, которую заметили в предке: возможно, она отзывается и в вас",
  ],
  unknown: [
    "у каждой фамилии — своя дорога через поколения, и её стоит проверять через документы, географию и семейные версии",
  ],
};

export function analyzeSurname(input: string): SurnameStory | null {
  const surname = parseSurnameInput(input);
  if (!surname) return null;
  const code = computeSurnameCode(surname);
  if (!code) return null;

  const lower = surname.toLowerCase();
  const knownKey = lower.endsWith("а") ? lower.slice(0, -1) : lower;
  const known = KNOWN_SURNAME_STORIES[knownKey];
  if (known) return { surname, code, ...known };

  const detected = detectOriginKind(lower);
  const stem = stemOf(lower);
  const occupation = OCCUPATION_ROOTS.find((o) => lower.includes(o.root) || stem.includes(o.root));

  const originKind: SurnameOriginKind = occupation ? "occupational" : detected.kind;
  const originLabel = occupation ? "Профессиональная фамилия" : detected.label;
  const originStory = occupation
    ? `Корень фамилии связан с ${occupation.label}: вероятно, предок занимался этим ремеслом, и занятие закрепилось как фамилия.`
    : detected.story;

  const familyTheme = occupation
    ? occupation.theme
    : seededPick(lower, THEME_BY_KIND[originKind]);

  const rootHint = occupation ? occupation.label : null;
  const shareLine = occupation
    ? `${surname} — фамилия от ${occupation.label}.`
    : `${surname} — ${originLabel.toLowerCase()}.`;

  return {
    surname,
    code,
    originKind,
    originLabel,
    originStory,
    regionHint: detected.region,
    rootHint,
    familyTheme,
    shareLine,
    evidence: null,
  };
}

// Факты для AI — чтобы платный разбор опирался на распознанную форму, а не выдумывал
// этимологию. AI расширяет это в тёплый родовой нарратив, без фатализма.
export function surnameFactsForAI(
  story: SurnameStory,
  comparison: SurnameCode | null = null,
  auditInput?: ParsedSurnameAuditInput,
): string {
  const lower = story.surname.toLowerCase();
  const stem = stemOf(lower);
  const formula = story.code.letters.map((item) => `${item.letter}=${item.value}`).join(" + ");
  const comparisonFormula = comparison?.letters.map((item) => `${item.letter}=${item.value}`).join(" + ") ?? "";
  return [
    "ТОЧНО РАССЧИТАНО ПО МЕТОДУ ETerapy CYRILLIC LINEAGE CODE V1 (не меняй числа, буквы и Арканы):",
    `Основная формула: ${formula} = ${story.code.sum}. Базовое число 1–9: ${story.code.baseNumber}. Арканический индекс 1–22: ${story.code.arcanaIndex}, ${story.code.arcanaGlyph} «${story.code.arcanaName}». Внутренний код гласных: ${story.code.innerNumber ?? "нет"}. Внешний код согласных: ${story.code.outerNumber ?? "нет"}.`,
    comparison
      ? `Формула второго варианта: ${comparisonFormula} = ${comparison.sum}. Базовое число: ${comparison.baseNumber}. Арканический индекс: ${comparison.arcanaIndex}, ${comparison.arcanaGlyph} «${comparison.arcanaName}». Внутренний код: ${comparison.innerNumber ?? "нет"}. Внешний код: ${comparison.outerNumber ?? "нет"}.`
      : "",
    auditInput ? `Сценарий: ${auditInput.mode}. Фокус: ${auditInput.focus || "не задан"}. Контекст пользователя: ${auditInput.context || "не задан"}.` : "",
    "Расчётный статус: арифметика и соответствие Аркану детерминированы системой. Родовой ресурс, тень, денежный сценарий и черты характера — символическая интерпретация, а не доказанные факты семьи.",
    "ОНОМАСТИЧЕСКИЙ КАРКАС (опирайся на него, не подменяй общей догадкой по суффиксу):",
    `Фамилия: ${story.surname}. Тип: ${story.originLabel}. ${story.originStory}`,
    story.evidence ? "Источниковый статус: есть словарные и документальные подсказки; цитируй их как подсказки, не как доказательство родства." : "Источниковый статус: эвристика по форме фамилии. Нельзя утверждать конкретную географию, занятие предка или историю рода как подтверждённый факт.",
    story.evidence?.baseLexeme
      ? `Исходная лексема: «${story.evidence.baseLexeme}». Не используй ошибочную механическую основу «${stem}».`
      : stem ? `Видимая основа/корень после снятия типового суффикса: «${stem}». Проверь версии: личное имя, прозвище, занятие, местность, качество или предмет.` : "",
    story.rootHint ? `Связана с: ${story.rootHint}.` : "",
    story.regionHint ? `География формы: ${story.regionHint}.` : "",
    story.evidence ? `Словарные значения: ${story.evidence.dictionaryMeanings.join("; ")}.` : "",
    story.evidence ? `Документальные следы: ${story.evidence.historicalMentions.join("; ")}.` : "",
    story.evidence ? `География носителей/версии: ${story.evidence.geography.join(", ")}.` : "",
    story.evidence ? `Источниковые подсказки: ${story.evidence.sourceNotes.join("; ")}. Не превращай их в доказательство родства конкретной семьи.` : "",
    `Символическая тема для самопроверки: ${story.familyTheme}. Не выдавай её за установленный факт о характере или роде.`,
    "Чётко раздели: документированный след, словарное значение, наиболее вероятную этимологию и альтернативную версию. Можно прямо назвать неудобное историческое значение слова, но не переносить его на заказчика или современных носителей фамилии.",
    "Не пересчитывай формулы, не добавляй случайные карты, не выдумывай предков, семейные события, проклятия, диагнозы, уровень интеллекта или финансовый потолок.",
  ].filter(Boolean).join("\n");
}
