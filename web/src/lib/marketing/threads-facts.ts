/**
 * B766 — слой проверяемых фактов для постов Threads.
 *
 * Перед текстом поста «про знак/Луну/Таро» агент фактов зовёт КОД платформы
 * (эфемериды `astronomy-engine`, колода Таро) и получает данные с источником,
 * без прозы. Факт неизменяем: автор получает его как есть, а проверка кодом
 * ловит пост, который выдумывает астрологию сверх факта (другой знак у Луны,
 * ретроград без ретрограда, полнолуние не в полнолуние).
 *
 * Факт считается на время СЛОТА, а не на время написания: пост пишется за
 * 12–30 часов до выхода, и «Луна в Скорпионе» должна быть правдой в момент
 * публикации.
 */

import { MoonPhase, MakeTime } from "astronomy-engine";
import { z } from "zod";

import { longitudeOfPlanet, norm360 } from "@/lib/astro/ecliptic";
import { gateLineFromLongitude } from "@/lib/human-design";
import { NUMBER_KEYWORD, computeNumerology } from "@/lib/numerology";
import { planetSignAt, signTransits } from "@/lib/astro/sign-transits";
import { TAROT_DECK } from "@/lib/tarot-deck";
import type { LimitViolation } from "@/lib/marketing/platform-limits";

export const FACT_MECHANICS = ["moon_sign", "moon_phase", "retrograde", "sun_season", "tarot_card", "day_number", "hd_sun_gate"] as const;

export const threadsFactSchema = z.object({
  mechanic: z.enum(FACT_MECHANICS),
  /** Короткое утверждение для автора: что именно верно на момент слота. */
  statement: z.string().min(5).max(200),
  /** Откуда взято: модуль платформы, чтобы факт можно было перепроверить. */
  source: z.string().min(3),
  /** Для проверки кодом: знак, планета или фаза, о которых утверждение. */
  subject: z.object({
    planet: z.string().optional(),
    sign: z.string().optional(),
    phase: z.enum(["new", "waxing", "full", "waning"]).optional(),
    retrograde: z.boolean().optional(),
    card: z.string().optional(),
    /** Число дня (нумерология) и ворота Солнца (дизайн человека) — общие для всех, без даты рождения. */
    number: z.number().int().optional(),
    gate: z.number().int().optional(),
  }),
  validUntil: z.string().datetime().nullable(),
});

export type ThreadsFact = Readonly<z.infer<typeof threadsFactSchema>>;

const SIGN_LOCATIVE: Record<string, string> = {
  aries: "Овне", taurus: "Тельце", gemini: "Близнецах", cancer: "Раке", leo: "Льве", virgo: "Деве",
  libra: "Весах", scorpio: "Скорпионе", sagittarius: "Стрельце", capricorn: "Козероге", aquarius: "Водолее", pisces: "Рыбах",
};

const PLANET_NAME: Record<string, string> = { mercury: "Меркурий", venus: "Венера", mars: "Марс" };
const RETROGRADE_PLANETS = ["mercury", "venus", "mars"] as const;
const DAY_MS = 86_400_000;

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function ruDate(date: Date): string {
  const msk = new Date(date.getTime() + 3 * 3_600_000);
  return `${msk.getUTCDate()} ${MONTHS[msk.getUTCMonth()]}`;
}

function freeze(fact: z.infer<typeof threadsFactSchema>): ThreadsFact {
  return Object.freeze(threadsFactSchema.parse(fact));
}

export function moonSignFact(at: Date): ThreadsFact {
  const sign = planetSignAt("moon", at);
  const stay = signTransits("moon", sign.key, new Date(at.getTime() - 3 * DAY_MS), new Date(at.getTime() + 4 * DAY_MS))
    .find((transit) => transit.start <= at && at <= transit.end);
  const until = stay && !stay.clampedEnd ? stay.end : null;
  return freeze({
    mechanic: "moon_sign",
    statement: `Луна в ${SIGN_LOCATIVE[sign.key]}${until ? ` до ${ruDate(until)}` : ""}`,
    source: "astro/sign-transits.ts · planetSignAt/signTransits",
    subject: { planet: "moon", sign: sign.key },
    validUntil: until ? until.toISOString() : null,
  });
}

export type MoonPhaseKind = "new" | "waxing" | "full" | "waning";

export function moonPhaseKind(angle: number): MoonPhaseKind {
  const a = norm360(angle);
  if (a < 12 || a > 348) return "new";
  if (a >= 168 && a <= 192) return "full";
  return a < 180 ? "waxing" : "waning";
}

const PHASE_TEXT: Record<MoonPhaseKind, string> = {
  new: "Новолуние",
  waxing: "Луна растёт",
  full: "Полнолуние",
  waning: "Луна убывает",
};

export function moonPhaseFact(at: Date): ThreadsFact {
  const kind = moonPhaseKind(MoonPhase(MakeTime(at)));
  return freeze({
    mechanic: "moon_phase",
    statement: PHASE_TEXT[kind],
    source: "astronomy-engine · MoonPhase",
    subject: { planet: "moon", phase: kind },
    validUntil: null,
  });
}

/** Движется ли светило назад по эклиптике на момент `at` (суточный шаг вокруг него). */
export function isRetrograde(planet: string, at: Date): boolean {
  const before = longitudeOfPlanet(planet, MakeTime(new Date(at.getTime() - 12 * 3_600_000)));
  const after = longitudeOfPlanet(planet, MakeTime(new Date(at.getTime() + 12 * 3_600_000)));
  const delta = ((after - before + 540) % 360) - 180;
  return delta < 0;
}

/** Первый ретроградный из Меркурия/Венеры/Марса; `null`, если сейчас все идут прямо. */
export function retrogradeFact(at: Date): ThreadsFact | null {
  const planet = RETROGRADE_PLANETS.find((key) => isRetrograde(key, at));
  if (!planet) return null;
  let until: Date | null = null;
  for (let day = 1; day <= 120; day++) {
    const probe = new Date(at.getTime() + day * DAY_MS);
    if (!isRetrograde(planet, probe)) { until = probe; break; }
  }
  const sign = planetSignAt(planet, at);
  return freeze({
    mechanic: "retrograde",
    statement: `${PLANET_NAME[planet]} в ретрограде в ${SIGN_LOCATIVE[sign.key]}${until ? `, до ${ruDate(until)}` : ""}`,
    source: "astro/ecliptic.ts · longitudeOfPlanet (направление движения)",
    subject: { planet, sign: sign.key, retrograde: true },
    validUntil: until ? until.toISOString() : null,
  });
}

export function sunSeasonFact(at: Date): ThreadsFact {
  const sign = planetSignAt("sun", at);
  const stay = signTransits("sun", sign.key, new Date(at.getTime() - 35 * DAY_MS), new Date(at.getTime() + 35 * DAY_MS))
    .find((transit) => transit.start <= at && at <= transit.end);
  const until = stay && !stay.clampedEnd ? stay.end : null;
  return freeze({
    mechanic: "sun_season",
    statement: `Солнце в ${SIGN_LOCATIVE[sign.key]}${until ? ` до ${ruDate(until)}` : ""}: сезон знака ${sign.name}`,
    source: "astro/sign-transits.ts · planetSignAt/signTransits",
    subject: { planet: "sun", sign: sign.key },
    validUntil: until ? until.toISOString() : null,
  });
}

/** Карта «дня»: детерминированно по дате слота (МСК), чтобы повторный расчёт дал ту же карту. */
export function tarotCardFact(at: Date): ThreadsFact {
  const msk = new Date(at.getTime() + 3 * 3_600_000);
  const dayNumber = Math.floor(msk.getTime() / DAY_MS);
  const card = TAROT_DECK[((dayNumber * 2654435761) >>> 0) % TAROT_DECK.length];
  return freeze({
    mechanic: "tarot_card",
    statement: `Карта дня из колоды Райдера — Уэйта: ${card.name} (${card.upright})`,
    source: "tarot-deck.ts · TAROT_DECK",
    subject: { card: card.code },
    validUntil: new Date(Math.floor(msk.getTime() / DAY_MS) * DAY_MS + DAY_MS - 3 * 3_600_000).toISOString(),
  });
}

const MSK_MS = 3 * 3_600_000;

/** Число дня: нумерология даты слота по Москве, общее для всей аудитории (без даты рождения читателя). */
export function dayNumberFact(at: Date): ThreadsFact {
  const msk = new Date(at.getTime() + MSK_MS);
  const dd = String(msk.getUTCDate()).padStart(2, "0");
  const mm = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const number = computeNumerology(`${dd}.${mm}.${msk.getUTCFullYear()}`).lifePath;
  const endOfDay = new Date(Math.floor(msk.getTime() / DAY_MS) * DAY_MS + DAY_MS - MSK_MS);
  return freeze({
    mechanic: "day_number",
    statement: `Число дня — ${number}${NUMBER_KEYWORD[number] ? `: ${NUMBER_KEYWORD[number]}` : ""}`,
    source: "numerology.ts · computeNumerology (дата слота по Москве)",
    subject: { number },
    validUntil: endOfDay.toISOString(),
  });
}

function sunGateAt(at: Date): number {
  return gateLineFromLongitude(longitudeOfPlanet("sun", MakeTime(at))).gate;
}

/** Ворота дизайна человека, через которые идёт Солнце в момент слота; смена ворот — раз в ~6 суток. */
export function sunGateFact(at: Date): ThreadsFact {
  const gate = sunGateAt(at);
  let until: Date | null = null;
  for (let hours = 6; hours <= 8 * 24; hours += 6) {
    const probe = new Date(at.getTime() + hours * 3_600_000);
    if (sunGateAt(probe) !== gate) { until = probe; break; }
  }
  return freeze({
    mechanic: "hd_sun_gate",
    statement: `Солнце сейчас проходит ворота ${gate} в дизайне человека${until ? `, примерно до ${ruDate(until)}` : ""}`,
    source: "human-design.ts · gateLineFromLongitude (долгота Солнца)",
    subject: { planet: "sun", gate },
    validUntil: until ? until.toISOString() : null,
  });
}

export function gatherThreadsFacts(at: Date): ThreadsFact[] {
  return [moonSignFact(at), moonPhaseFact(at), retrogradeFact(at), sunSeasonFact(at), tarotCardFact(at)]
    .filter((fact): fact is ThreadsFact => fact !== null);
}

const B = "(?<![а-яё])";
const E = "(?![а-яё])";
const TAROT_HINT = /таро|аркан|расклад|карт[аыуе]\s+дня/i;
const NUMEROLOGY_HINT = /нумеролог|число\s+(?:дня|судьбы)|цифр[аыуе]\s+дня/i;
const HD_HINT = /дизайн\s+человека|ворота|генератор|проектор|рефлектор/i;
const ASTRO_HINT = new RegExp(
  "знак|зодиак|астро|гороскоп|лун[аыуе]|лунн|ретроград|планет|овен|овн[аеуы]|тельц|близнец|скорпион|стрел[её]ц|козерог|водоле"
  + `|${B}(?:рак|лев|льв[аеуы]?|дев[аеуы]|весы|весах|рыбы|рыбах)${E}`,
  "i",
);

/** Нужен ли посту факт: тема про знаки, Луну, планеты или Таро. Остальным он только мешает. */
export function needsThreadsFact(input: { cluster: string | null; scene: string | null }): boolean {
  const haystack = `${input.cluster ?? ""} ${input.scene ?? ""}`;
  return TAROT_HINT.test(haystack) || NUMEROLOGY_HINT.test(haystack) || HD_HINT.test(haystack) || ASTRO_HINT.test(haystack);
}

/**
 * Выбор факта под пост: тема про Таро получает карту, остальные — астрономию.
 * `seed` (id публикации) разводит соседние слоты по разным механикам, чтобы
 * лента не состояла из восьми «Луна в …».
 */
export function pickThreadsFact(input: {
  at: Date;
  cluster: string | null;
  scene: string | null;
  seed: string;
}): ThreadsFact | null {
  if (!needsThreadsFact(input)) return null;
  const haystack = `${input.cluster ?? ""} ${input.scene ?? ""}`;
  if (TAROT_HINT.test(haystack)) return tarotCardFact(input.at);
  if (NUMEROLOGY_HINT.test(haystack)) return dayNumberFact(input.at);
  if (HD_HINT.test(haystack)) return sunGateFact(input.at);
  const facts = gatherThreadsFacts(input.at).filter((fact) => fact.mechanic !== "tarot_card");
  let hash = 0;
  for (const ch of input.seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return facts[hash % facts.length];
}

const SIGN_STEMS: ReadonlyArray<{ key: string; stem: RegExp }> = [
  { key: "aries", stem: /овн[аеуы]|овен/i },
  { key: "taurus", stem: /тельц/i },
  { key: "gemini", stem: /близнец/i },
  { key: "cancer", stem: new RegExp(`${B}рак(?:е|а|у|ом)?${E}`, "i") },
  { key: "leo", stem: new RegExp(`${B}(?:л[ьеъ]в[аеуы]?|лев)${E}`, "i") },
  { key: "virgo", stem: new RegExp(`${B}дев[аеуы]${E}`, "i") },
  { key: "libra", stem: new RegExp(`${B}вес(?:ы|ах|ам|ов)${E}`, "i") },
  { key: "scorpio", stem: /скорпион/i },
  { key: "sagittarius", stem: /стрел[её]ц|стрельц/i },
  { key: "capricorn", stem: /козерог/i },
  { key: "aquarius", stem: /водоле/i },
  { key: "pisces", stem: new RegExp(`${B}рыб(?:ы|ах|ам|ами)${E}`, "i") },
];

/**
 * Код-проверка «пост не выдумывает астрологии сверх факта». Проверяются только
 * утверждения о небе, которые легко опровергнуть: знак Луны/Солнца, ретроград,
 * фаза Луны. Обращение к знаку-аудитории («Тельцы, это про вас») не трогается.
 */
export function factFindings(fact: ThreadsFact | null, text: string): LimitViolation[] {
  if (!fact || !text.trim()) return [];
  const findings: LimitViolation[] = [];
  const add = (rule: string, issue: string, brief: string) =>
    findings.push({ kind: "contract", rule, issue, brief });
  const flat = text.toLowerCase();

  for (const planet of [{ key: "moon", re: /лун[аыеу]\s+(?:в|во)\s+([а-яё]+)/gi }, { key: "sun", re: /солнце\s+(?:в|во)\s+([а-яё]+)/gi }]) {
    for (const match of text.matchAll(planet.re)) {
      const said = SIGN_STEMS.find((entry) => entry.stem.test(match[1]));
      if (!said) continue;
      // Для планеты вне факта сверяться не с чем: утверждение о ней — выдумка.
      if (planet.key !== fact.subject.planet) {
        add("fact-extra-sky", `В посте утверждение «${match[0]}», которого нет среди фактов.`,
          `Убери «${match[0]}»: о небе говори только тем, что дано в факте: «${fact.statement}».`);
      } else if (said.key !== fact.subject.sign) {
        add("fact-contradiction", `Пост противоречит факту: «${match[0]}», а верно «${fact.statement}».`,
          `Исправь на факт: «${fact.statement}», или убери утверждение о небе.`);
      }
    }
  }

  if (/ретроград/.test(flat) && fact.subject.retrograde !== true) {
    add("fact-retrograde", "В посте ретроград, которого нет среди фактов.", `Убери ретроград: данный факт — «${fact.statement}».`);
  }
  for (const match of text.matchAll(/число\s+дня\s*[—–:-]?\s*(\d{1,2})/gi)) {
    if (fact.mechanic !== "day_number") {
      add("fact-day-number", `В посте «${match[0]}», а такого факта нет.`, `Убери число дня: данный факт — «${fact.statement}».`);
    } else if (Number(match[1]) !== fact.subject.number) {
      add("fact-day-number", `Пост называет «${match[0]}», а верно «${fact.statement}».`, `Исправь на факт: «${fact.statement}».`);
    }
  }
  const claimsFull = /полнолуни/.test(flat);
  const claimsNew = /новолуни/.test(flat);
  if ((claimsFull && fact.subject.phase !== "full") || (claimsNew && fact.subject.phase !== "new")) {
    add("fact-phase", "В посте фаза Луны, которой нет среди фактов.", `Убери фазу Луны или опиши ту, что дана: «${fact.statement}».`);
  }
  return findings;
}

/** Строка для задачи автору: факт как данность и правило обращения с ним. */
export function factForWriter(fact: ThreadsFact | null): { statement: string; source: string; rule: string } | null {
  if (!fact) return null;
  return {
    statement: fact.statement,
    source: fact.source,
    rule: "Это проверенный факт, он неизменяем: используй его как есть и не добавляй другой астрологии "
      + "(другие знаки у Луны, ретрограды, фазы). Говори мягко, как образ, который узнают почти все; "
      + "без диагнозов и обещаний про здоровье и деньги.",
  };
}
