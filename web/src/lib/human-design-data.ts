// B387 (M26) — «Дизайн человека» (Human Design): каноничные справочные таблицы.
// Это НЕ символическая разметка, как esoteric-chart.ts, а настоящая методика:
// 64 ворот на тропическом колесе (порядок Rave-мандалы), 36 каналов, 9 центров,
// тип определяется связностью графа центров. Реальные эфемериды считаются в
// human-design.ts (astronomy-engine), здесь — только неизменные данные методики.
//
// Проверка якоря: ворота 41 начинаются ровно на 2° Водолея (302°) — это известная
// точка «нового года» Дизайна человека (Солнце входит в 41-е ворота ≈ 22 января),
// что подтверждает правильность HD_GATE_SEQUENCE + HD_START_DEGREE.

// 64 ворот в зодиакальном порядке (Овен → Рыбы), якорь — 28°15′ Рыб.
export const HD_GATE_SEQUENCE: readonly number[] = [
  25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20,
  16, 35, 45, 12, 15, 52,
  39, 53, 62, 56, 31, 33,
  7, 4, 29, 59, 40, 64,
  47, 6, 46, 18, 48, 57,
  32, 50, 28, 44, 1, 43,
  14, 34, 9, 5, 26, 11,
  10, 58, 38, 54, 61, 60,
  41, 19, 13, 49, 30, 55,
  37, 63, 22, 36,
];

export const HD_START_DEGREE = 358.25; // 28°15′ Рыб
export const HD_GATE_ARC = 360 / 64; // 5.625° на ворота
export const HD_LINE_ARC = HD_GATE_ARC / 6; // 0.9375° на линию

export type HDCenterKey =
  | "head"
  | "ajna"
  | "throat"
  | "g"
  | "heart"
  | "spleen"
  | "sacral"
  | "solar"
  | "root";

export type HDCenterDef = {
  key: HDCenterKey;
  name: string;
  motor: boolean;
  gates: number[];
};

// Каноничное распределение 64 ворот по 9 центрам (исправлено относительно
// публичных «vibe»-репозиториев: ворота 28 принадлежат ТОЛЬКО Селезёнке, а не
// Корню — иначе тип считается неверно).
export const HD_CENTERS: Record<HDCenterKey, HDCenterDef> = {
  head: { key: "head", name: "Голова", motor: false, gates: [61, 63, 64] },
  ajna: { key: "ajna", name: "Аджна", motor: false, gates: [4, 11, 17, 24, 43, 47] },
  throat: { key: "throat", name: "Горло", motor: false, gates: [8, 12, 16, 20, 23, 31, 33, 35, 45, 56, 62] },
  g: { key: "g", name: "G-центр (Самость)", motor: false, gates: [1, 2, 7, 10, 13, 15, 25, 46] },
  heart: { key: "heart", name: "Сердце (Воля)", motor: true, gates: [21, 26, 40, 51] },
  spleen: { key: "spleen", name: "Селезёнка", motor: false, gates: [18, 28, 32, 44, 48, 50, 57] },
  sacral: { key: "sacral", name: "Сакрал", motor: true, gates: [3, 5, 9, 14, 27, 29, 34, 42, 59] },
  solar: { key: "solar", name: "Солнечное сплетение", motor: true, gates: [6, 22, 30, 36, 37, 49, 55] },
  root: { key: "root", name: "Корень", motor: true, gates: [19, 38, 39, 41, 52, 53, 54, 58, 60] },
};

export const HD_CENTER_ORDER: readonly HDCenterKey[] = [
  "head", "ajna", "throat", "g", "heart", "spleen", "sacral", "solar", "root",
];

// Обратный индекс ворота → центр (строится один раз).
export const HD_GATE_TO_CENTER: Record<number, HDCenterKey> = (() => {
  const map: Record<number, HDCenterKey> = {};
  for (const def of Object.values(HD_CENTERS)) {
    for (const gate of def.gates) map[gate] = def.key;
  }
  return map;
})();

// 36 официальных каналов (пары ворот). Восстановлены недостающие 10-34 и 10-57,
// которых нет в неполных публичных таблицах (там бывает 34 канала вместо 36).
export const HD_CHANNELS: ReadonlyArray<readonly [number, number]> = [
  [1, 8], [2, 14], [3, 60], [4, 63], [5, 15], [6, 59],
  [7, 31], [9, 52], [10, 20], [10, 34], [10, 57], [11, 56],
  [12, 22], [13, 33], [16, 48], [17, 62], [18, 58], [19, 49],
  [20, 34], [20, 57], [21, 45], [23, 43], [24, 61], [25, 51],
  [26, 44], [27, 50], [28, 38], [29, 46], [30, 41], [32, 54],
  [34, 57], [35, 36], [37, 40], [39, 55], [42, 53], [47, 64],
];

// Светила/точки, используемые в бодиграфе (13 активаций × 2 = Личность + Дизайн).
export type HDBodyKey =
  | "sun" | "earth" | "moon" | "north_node" | "south_node"
  | "mercury" | "venus" | "mars" | "jupiter" | "saturn"
  | "uranus" | "neptune" | "pluto" | "chiron" | "lilith";

export const HD_BODIES: ReadonlyArray<{ key: HDBodyKey; label: string; glyph: string }> = [
  { key: "sun", label: "Солнце", glyph: "☉" },
  { key: "earth", label: "Земля", glyph: "⊕" },
  { key: "moon", label: "Луна", glyph: "☽" },
  { key: "north_node", label: "Северный узел", glyph: "☊" },
  { key: "south_node", label: "Южный узел", glyph: "☋" },
  { key: "mercury", label: "Меркурий", glyph: "☿" },
  { key: "venus", label: "Венера", glyph: "♀" },
  { key: "mars", label: "Марс", glyph: "♂" },
  { key: "jupiter", label: "Юпитер", glyph: "♃" },
  { key: "saturn", label: "Сатурн", glyph: "♄" },
  { key: "uranus", label: "Уран", glyph: "♅" },
  { key: "neptune", label: "Нептун", glyph: "♆" },
  { key: "pluto", label: "Плутон", glyph: "♇" },
  { key: "chiron", label: "Хирон", glyph: "⚷" },
  { key: "lilith", label: "Лилит (средняя)", glyph: "⚸" },
];

export type HDType =
  | "manifestor"
  | "generator"
  | "manifesting-generator"
  | "projector"
  | "reflector";

export type HDTypeInfo = {
  key: HDType;
  name: string;
  strategy: string;
  signature: string;
  notSelf: string;
  share: string; // короткая строка для расшариваемой карточки
  summary: string;
};

// Тон платформы: язык самопонимания, без фатализма и приговора.
export const HD_TYPE_INFO: Record<HDType, HDTypeInfo> = {
  manifestor: {
    key: "manifestor",
    name: "Манифестор",
    strategy: "Информировать перед действием",
    signature: "Покой",
    notSelf: "Гнев",
    share: "Я инициирую и задаю движение",
    summary:
      "Ваша природа — начинать и задавать импульс. Когда вы предупреждаете близких перед тем, как действовать, сопротивления становится меньше, а внутри — покой.",
  },
  generator: {
    key: "generator",
    name: "Генератор",
    strategy: "Откликаться на то, что приходит",
    signature: "Удовлетворение",
    notSelf: "Фрустрация",
    share: "У меня есть устойчивая энергия для своего дела",
    summary:
      "У вас есть глубокий ресурс энергии для того, что по-настоящему откликается. Тело само подсказывает «да» и «нет» — стоит идти за этим откликом, а не за «надо».",
  },
  "manifesting-generator": {
    key: "manifesting-generator",
    name: "Манифестирующий Генератор",
    strategy: "Откликаться, затем информировать",
    signature: "Удовлетворение",
    notSelf: "Фрустрация и гнев",
    share: "Я делаю несколько дел сразу и быстро",
    summary:
      "Вы соединяете энергию отклика со скоростью и многозадачностью. Сначала — телесный отклик, потом короткое «предупреждаю» близким, и можно двигаться своим нелинейным путём.",
  },
  projector: {
    key: "projector",
    name: "Проектор",
    strategy: "Ждать приглашения",
    signature: "Успех и признание",
    notSelf: "Горечь",
    share: "Я вижу людей и системы насквозь",
    summary:
      "Ваш дар — видеть других и направлять. Он раскрывается там, где вас замечают и приглашают. Признание приходит, когда вы вкладываетесь туда, где вам рады, а не доказываете на пределе.",
  },
  reflector: {
    key: "reflector",
    name: "Рефлектор",
    strategy: "Дать решению лунный цикл (≈28 дней)",
    signature: "Удивление",
    notSelf: "Разочарование",
    share: "Я отражаю состояние своего окружения",
    summary:
      "Вы очень чувствительны к среде и отражаете её состояние. Важным решениям полезно дать время полного лунного цикла и выбирать места и людей, рядом с которыми вам хорошо.",
  },
};

export type HDAuthorityKey =
  | "emotional"
  | "sacral"
  | "splenic"
  | "ego"
  | "self"
  | "mental"
  | "lunar";

export const HD_AUTHORITY_INFO: Record<HDAuthorityKey, { name: string; hint: string }> = {
  emotional: {
    name: "Эмоциональный авторитет",
    hint: "Понимание приходит со временем — дайте эмоциональной волне пройти, не решайте на пике.",
  },
  sacral: {
    name: "Сакральный авторитет",
    hint: "Слушайте телесный отклик «да/нет» здесь и сейчас, до слов.",
  },
  splenic: {
    name: "Селезёночный авторитет",
    hint: "Тихий мгновенный интуитивный сигнал, который звучит только один раз.",
  },
  ego: {
    name: "Авторитет сердца (воли)",
    hint: "Опирайтесь на то, чего по-настоящему хочется и на что есть силы.",
  },
  self: {
    name: "Авторитет самости (G-центр)",
    hint: "Правда слышна, когда вы проговариваете её вслух доверенному человеку.",
  },
  mental: {
    name: "Ментальный (внешний) авторитет",
    hint: "Думайте вслух с теми, кому доверяете, — подсказку даёт правильная среда.",
  },
  lunar: {
    name: "Лунный авторитет",
    hint: "Дайте важному решению пройти полный цикл около 28 дней.",
  },
};

// Сериализуемые типы результата (живут здесь, в чистом модуле без astronomy-engine,
// чтобы клиентский бодиграф мог импортировать их без серверной зависимости).
export type HDActivation = {
  body: HDBodyKey;
  label: string;
  glyph: string;
  longitude: number;
  gate: number;
  line: number;
  side: "personality" | "design";
};

export type HDDefinedChannel = {
  gates: [number, number];
  centers: [HDCenterKey, HDCenterKey];
};

export type HDVariable = {
  color: number;
  tone: number;
  direction: "left" | "right";
};

export type HDVariables = {
  determination: HDVariable;
  environment: HDVariable;
  motivation: HDVariable;
  perspective: HDVariable;
};

export type HumanDesignChart = {
  type: HDType;
  typeName: string;
  strategy: string;
  signature: string;
  notSelf: string;
  typeSummary: string;
  shareLine: string;
  authority: HDAuthorityKey;
  authorityName: string;
  authorityHint: string;
  profile: string;
  profileName: string;
  definition: string;
  centers: Array<{ key: HDCenterKey; name: string; defined: boolean; motor: boolean }>;
  definedCenters: HDCenterKey[];
  definedChannels: HDDefinedChannel[];
  activeGates: number[];
  personality: HDActivation[];
  design: HDActivation[];
  variables?: HDVariables;
  hasExactTime: boolean;
};

// Профиль = линия Солнца Личности / линия Солнца Дизайна.
export const HD_PROFILE_LINES: Record<number, { name: string; note: string }> = {
  1: { name: "Исследователь", note: "нужна прочная опора знания под ногами" },
  2: { name: "Отшельник", note: "естественный дар, которому нужно уединение" },
  3: { name: "Экспериментатор", note: "учится через пробы, ошибки и живой опыт" },
  4: { name: "Друг", note: "раскрывается через близкие связи и доверие" },
  5: { name: "Практик", note: "проверяет решения на опыте и сталкивается с ожиданиями других" },
  6: { name: "Пример", note: "живёт в три этапа и со временем становится ориентиром" },
};
