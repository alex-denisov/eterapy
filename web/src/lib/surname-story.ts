// B391 (M26) — «История фамилии». Бесплатный магнит считается ДЕТЕРМИНИРОВАННО
// по морфологии фамилии (суффикс/корень) — без AI-вызова, мгновенно, стабильно
// для расшаривания и без риска абьюза анонимного эндпоинта. Платный «родовой
// разбор» (через symbolic-пайплайн) строится поверх этих фактов с помощью AI.
//
// Тон: честно и мягко, БЕЗ ФАТАЛИЗМА. Мы говорим о ФОРМЕ фамилии и о том, что она
// исторически означала, а не о судьбе человека или «карме рода».

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

const KNOWN_SURNAME_STORIES: Record<string, Omit<SurnameStory, "surname">> = {
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

  const lower = surname.toLowerCase();
  const knownKey = lower.endsWith("а") ? lower.slice(0, -1) : lower;
  const known = KNOWN_SURNAME_STORIES[knownKey];
  if (known) return { surname, ...known };

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
export function surnameFactsForAI(story: SurnameStory): string {
  const lower = story.surname.toLowerCase();
  const stem = stemOf(lower);
  return [
    "ОНОМАСТИЧЕСКИЙ КАРКАС (опирайся на него, не подменяй общей догадкой по суффиксу):",
    `Фамилия: ${story.surname}. Тип: ${story.originLabel}. ${story.originStory}`,
    story.evidence?.baseLexeme
      ? `Исходная лексема: «${story.evidence.baseLexeme}». Не используй ошибочную механическую основу «${stem}».`
      : stem ? `Видимая основа/корень после снятия типового суффикса: «${stem}». Проверь версии: личное имя, прозвище, занятие, местность, качество или предмет.` : "",
    story.rootHint ? `Связана с: ${story.rootHint}.` : "",
    story.regionHint ? `География формы: ${story.regionHint}.` : "",
    story.evidence ? `Словарные значения: ${story.evidence.dictionaryMeanings.join("; ")}.` : "",
    story.evidence ? `Документальные следы: ${story.evidence.historicalMentions.join("; ")}.` : "",
    story.evidence ? `География носителей/версии: ${story.evidence.geography.join(", ")}.` : "",
    story.evidence ? `Источниковые подсказки: ${story.evidence.sourceNotes.join("; ")}. Не превращай их в доказательство родства конкретной семьи.` : "",
    `Маршрут проверки: ${story.familyTheme}.`,
    "Чётко раздели: документированный след, словарное значение, наиболее вероятную этимологию и альтернативную версию. Можно прямо назвать неудобное историческое значение слова, но не переносить его на заказчика или современных носителей фамилии.",
  ].filter(Boolean).join("\n");
}
