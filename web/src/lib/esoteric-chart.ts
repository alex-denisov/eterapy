// B388 — настоящая структурная визуализация эзотерических результатов.
// Мы честно трактуем астрологию как символический язык (а не эфемериды): расчёт
// детерминированный (одни данные → одно и то же колесо), но это структурная схема
// «о чём расклад», совпадающая с интерпретацией, а не астрономический прогноз.
// Тот же детерминированный движок переиспользуется «Дизайном человека» (B387).

export type ZodiacSign = {
  key: string;
  name: string;
  glyph: string;
  element: "огонь" | "земля" | "воздух" | "вода";
};

// Порядок = порядок колеса (Овен наверху по часовой стрелке).
export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  { key: "aries", name: "Овен", glyph: "♈", element: "огонь" },
  { key: "taurus", name: "Телец", glyph: "♉", element: "земля" },
  { key: "gemini", name: "Близнецы", glyph: "♊", element: "воздух" },
  { key: "cancer", name: "Рак", glyph: "♋", element: "вода" },
  { key: "leo", name: "Лев", glyph: "♌", element: "огонь" },
  { key: "virgo", name: "Дева", glyph: "♍", element: "земля" },
  { key: "libra", name: "Весы", glyph: "♎", element: "воздух" },
  { key: "scorpio", name: "Скорпион", glyph: "♏", element: "вода" },
  { key: "sagittarius", name: "Стрелец", glyph: "♐", element: "огонь" },
  { key: "capricorn", name: "Козерог", glyph: "♑", element: "земля" },
  { key: "aquarius", name: "Водолей", glyph: "♒", element: "воздух" },
  { key: "pisces", name: "Рыбы", glyph: "♓", element: "вода" },
] as const;

// Символические «светила» для разметки колеса (не астрономические позиции).
export const CHART_LUMINARIES: ReadonlyArray<{ key: string; glyph: string; label: string }> = [
  { key: "sun", glyph: "☉", label: "Солнце — суть" },
  { key: "moon", glyph: "☽", label: "Луна — чувства" },
  { key: "mercury", glyph: "☿", label: "Меркурий — речь" },
  { key: "venus", glyph: "♀", label: "Венера — близость" },
  { key: "mars", glyph: "♂", label: "Марс — действие" },
  { key: "jupiter", glyph: "♃", label: "Юпитер — рост" },
  { key: "saturn", glyph: "♄", label: "Сатурн — структура" },
  { key: "uranus", glyph: "♅", label: "Уран — свобода" },
  { key: "neptune", glyph: "♆", label: "Нептун — образ" },
  { key: "pluto", glyph: "♇", label: "Плутон — глубина" },
] as const;

function seededHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string): () => number {
  let state = seededHash(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

const RU_MONTHS: Record<string, number> = {
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6,
  июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
};

export type ParsedBirthDate = { day: number; month: number; year: number | null; source: "parsed" | "derived" };

// Достаём дату рождения из свободного текста. Поддержка: DD.MM.YYYY, DD/MM/YYYY,
// YYYY-MM-DD, «5 мая 1990». Если ничего не нашли — детерминированно выводим
// день/месяц из хеша, чтобы колесо всё равно строилось.
export function parseBirthDate(text: string): ParsedBirthDate {
  const clean = (text ?? "").trim();

  const iso = clean.match(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (iso) {
    const year = Number(iso[1]);
    const month = clampMonth(Number(iso[2]));
    const day = clampDay(Number(iso[3]), month);
    return { day, month, year, source: "parsed" };
  }

  const dmy = clean.match(/\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b/);
  if (dmy) {
    const month = clampMonth(Number(dmy[2]));
    const day = clampDay(Number(dmy[1]), month);
    const rawYear = Number(dmy[3]);
    const year = rawYear < 100 ? 1900 + rawYear : rawYear;
    return { day, month, year, source: "parsed" };
  }

  const ru = clean
    .toLowerCase()
    .match(/\b(\d{1,2})\s+([а-яё]{3,})\.?\s*(\d{4})?/);
  if (ru) {
    const monthKey = Object.keys(RU_MONTHS).find((key) => ru[2].startsWith(key));
    if (monthKey) {
      const month = RU_MONTHS[monthKey];
      const day = clampDay(Number(ru[1]), month);
      const year = ru[3] ? Number(ru[3]) : null;
      return { day, month, year, source: "parsed" };
    }
  }

  const rng = makeRng(clean || "anon");
  const month = clampMonth(1 + Math.floor(rng() * 12));
  const day = clampDay(1 + Math.floor(rng() * 28), month);
  return { day, month, year: null, source: "derived" };
}

function clampMonth(m: number): number {
  if (!Number.isFinite(m)) return 1;
  return Math.min(12, Math.max(1, Math.round(m)));
}

function clampDay(d: number, month: number): number {
  const maxByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][clampMonth(month) - 1];
  if (!Number.isFinite(d)) return 1;
  return Math.min(maxByMonth, Math.max(1, Math.round(d)));
}

// Солнечный знак по дате (стандартные тропические границы).
export function zodiacSignForDate(day: number, month: number): ZodiacSign {
  const d = clampDay(day, month);
  const m = clampMonth(month);
  // [start day] границы знаков по месяцам (знак месяца до даты — предыдущий).
  const cutoffs: Record<number, [number, string, string]> = {
    1: [20, "capricorn", "aquarius"],
    2: [19, "aquarius", "pisces"],
    3: [21, "pisces", "aries"],
    4: [20, "aries", "taurus"],
    5: [21, "taurus", "gemini"],
    6: [21, "gemini", "cancer"],
    7: [23, "cancer", "leo"],
    8: [23, "leo", "virgo"],
    9: [23, "virgo", "libra"],
    10: [23, "libra", "scorpio"],
    11: [22, "scorpio", "sagittarius"],
    12: [22, "sagittarius", "capricorn"],
  };
  const [cutoff, before, after] = cutoffs[m];
  const key = d < cutoff ? before : after;
  return ZODIAC_SIGNS.find((sign) => sign.key === key) ?? ZODIAC_SIGNS[0];
}

export type ChartPlacement = {
  luminary: string;
  glyph: string;
  label: string;
  signKey: string;
  signName: string;
  signGlyph: string;
  // угол на колесе в градусах (0 = верх, по часовой стрелке)
  angle: number;
  degreeInSign: number;
};

export type NatalWheel = {
  kind: "natal";
  sunSign: ZodiacSign;
  ascendant: ZodiacSign | null;
  ascendantDegree?: number | null;
  houses?: Array<{ number: number; cusp: number; signName: string }>;
  calculation?: "ephemeris" | "legacy-symbolic";
  placements: ChartPlacement[];
  parsed: ParsedBirthDate;
};

// Детерминированное структурное колесо. Солнце — реальный солнечный знак по дате;
// остальные светила распределяются стабильным хешем (символическая разметка).
export function buildNatalWheel(birthData: string): NatalWheel {
  const parsed = parseBirthDate(birthData);
  const sunSign = zodiacSignForDate(parsed.day, parsed.month);
  const rng = makeRng(`natal:${birthData}`);
  const ascIndex = Math.floor(rng() * 12);
  const ascendant = ZODIAC_SIGNS[ascIndex];

  const sunIndex = ZODIAC_SIGNS.findIndex((s) => s.key === sunSign.key);
  const placements: ChartPlacement[] = CHART_LUMINARIES.map((lum, i) => {
    const signIndex = i === 0 ? sunIndex : Math.floor(rng() * 12);
    const sign = ZODIAC_SIGNS[signIndex];
    const withinSign = rng() * 30;
    const angle = (signIndex * 30 + withinSign) % 360;
    return {
      luminary: lum.key,
      glyph: lum.glyph,
      label: lum.label,
      signKey: sign.key,
      signName: sign.name,
      signGlyph: sign.glyph,
      angle,
      degreeInSign: withinSign,
    };
  });

  return { kind: "natal", sunSign, ascendant, placements, parsed, calculation: "legacy-symbolic" };
}

export type SynastryWheel = {
  kind: "compatibility-by-date";
  a: { sunSign: ZodiacSign; placements: ChartPlacement[] };
  b: { sunSign: ZodiacSign; placements: ChartPlacement[] };
  aspects: Array<{
    from: number;
    to: number;
    harmony: "flow" | "tension";
    fromLuminary?: string;
    toLuminary?: string;
    kind?: string;
    orb?: number;
  }>;
};

export function buildSynastryWheel(aData: string, bData: string): SynastryWheel {
  const a = buildNatalWheel(aData);
  const b = buildNatalWheel(bData);
  const rng = makeRng(`syn:${aData}|${bData}`);
  const aspects = a.placements.slice(0, 3).map((p, i) => ({
    from: p.angle,
    to: b.placements[(i + 1) % b.placements.length].angle,
    harmony: (rng() < 0.5 ? "flow" : "tension") as "flow" | "tension",
  }));
  return {
    kind: "compatibility-by-date",
    a: { sunSign: a.sunSign, placements: a.placements },
    b: { sunSign: b.sunSign, placements: b.placements },
    aspects,
  };
}
