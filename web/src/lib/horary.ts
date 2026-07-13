import type { ChartPlacement, NatalWheel } from "@/lib/esoteric-chart";
import { calculateAstrologyAspect } from "@/lib/astrology-aspects";

type TraditionalPlanet = "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn";

const RULER_BY_SIGN: Record<string, TraditionalPlanet> = {
  aries: "mars", taurus: "venus", gemini: "mercury", cancer: "moon", leo: "sun", virgo: "mercury",
  libra: "venus", scorpio: "mars", sagittarius: "jupiter", capricorn: "saturn", aquarius: "saturn", pisces: "jupiter",
};

const PLANET_LABEL: Record<TraditionalPlanet, string> = {
  sun: "Солнце", moon: "Луна", mercury: "Меркурий", venus: "Венера", mars: "Марс", jupiter: "Юпитер", saturn: "Сатурн",
};

const RADICALITY_LABEL: Record<HoraryJudgementFacts["radicality"], string> = {
  early: "ранний Асцендент — обстоятельства ещё формируются",
  late: "поздний Асцендент — ситуация уже близка к развязке",
  ordinary: "обычная степень Асцендента — вопрос созрел для рассмотрения",
};

const PHASE_LABEL: Record<NonNullable<HoraryJudgementFacts["contact"]>["phase"], string> = {
  applying: "сходящийся",
  separating: "расходящийся",
  unknown: "фаза не определена",
};

const DOMICILES: Record<TraditionalPlanet, string[]> = {
  sun: ["leo"], moon: ["cancer"], mercury: ["gemini", "virgo"], venus: ["taurus", "libra"], mars: ["aries", "scorpio"], jupiter: ["sagittarius", "pisces"], saturn: ["capricorn", "aquarius"],
};

const EXALTATION: Partial<Record<TraditionalPlanet, string>> = { sun: "aries", moon: "taurus", mercury: "virgo", venus: "pisces", mars: "capricorn", jupiter: "cancer", saturn: "libra" };

export type HoraryJudgementFacts = {
  method: "eterapy-horary-traditional-v1";
  question: string;
  category: string;
  subjectHouse: number;
  ascendantDegree: number;
  ascendantSign: string;
  radicality: "early" | "late" | "ordinary";
  querent: { planet: TraditionalPlanet; label: string; placement: ChartPlacement; dignity: string };
  quesited: { planet: TraditionalPlanet; label: string; placement: ChartPlacement; dignity: string };
  contact: { kind: string; orb: number; phase: "applying" | "separating" | "unknown" } | null;
  receptions: string[];
  moonContacts: Array<{ planet: string; kind: string; orb: number; phase: "applying" | "separating" | "unknown" }>;
};

function subjectHouse(input: string) {
  const explicit = input.match(/Категория:\s*(.+)/iu)?.[1]?.toLowerCase() ?? "";
  const question = input.match(/Вопрос:\s*(.+)/iu)?.[1]?.toLowerCase() ?? input.toLowerCase();
  const text = `${explicit} ${question}`;
  if (/отнош|любов|партн[её]р|брак/u.test(text)) return 7;
  if (/деньг|доход|зарплат|финанс/u.test(text)) return 2;
  if (/квартир|дом|недвиж|переезд|земл/u.test(text)) return 4;
  if (/работ|карьер|должност|бизнес/u.test(text)) return 10;
  if (/реб[её]н|дет/u.test(text)) return 5;
  if (/здоров|болез/u.test(text)) return 6;
  if (/поезд|путеше|образован|суд/u.test(text)) return 9;
  if (/документ|сообщен|переговор|контракт/u.test(text)) return 3;
  return 1;
}

function dignity(planet: TraditionalPlanet, placement: ChartPlacement) {
  if (DOMICILES[planet].includes(placement.signKey)) return "в обители — способен действовать своим способом";
  if (EXALTATION[planet] === placement.signKey) return "в экзальтации — заметно усилен";
  const oppositeIndex = (index: number) => (index + 6) % 12;
  const signs = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
  const detriments = DOMICILES[planet].map((sign) => signs[oppositeIndex(signs.indexOf(sign))]);
  if (detriments.includes(placement.signKey)) return "в изгнании — действует с затруднением";
  const exaltation = EXALTATION[planet];
  if (exaltation && signs[oppositeIndex(signs.indexOf(exaltation))] === placement.signKey) return "в падении — ресурс ослаблен";
  return "без главного эссенциального достоинства";
}

function placementFor(wheel: NatalWheel, planet: TraditionalPlanet) {
  const placement = wheel.placements.find((item) => item.luminary === planet);
  if (!placement) throw new Error(`Нет положения ${planet}`);
  return placement;
}

export function computeHoraryFacts(wheel: NatalWheel, input: string, futureWheel?: NatalWheel | null): HoraryJudgementFacts {
  if (typeof wheel.ascendantDegree !== "number" || !wheel.houses?.length) throw new Error("Для хорарной карты нужны точное время и координаты места");
  const ascendantDegree = wheel.ascendantDegree;
  const house = subjectHouse(input);
  const ascendantSign = wheel.ascendant?.key ?? wheel.houses[0].signName;
  const houseCusp = wheel.houses.find((item) => item.number === house)!;
  const signKeys = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
  const signNames = ["Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева", "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы"];
  const houseSign = signKeys[Math.max(0, signNames.indexOf(houseCusp.signName))];
  const querentPlanet = RULER_BY_SIGN[ascendantSign];
  const quesitedPlanet = RULER_BY_SIGN[houseSign];
  const querentPlacement = placementFor(wheel, querentPlanet);
  const quesitedPlacement = placementFor(wheel, quesitedPlanet);
  const contact = querentPlanet === quesitedPlanet ? { kind: "общий сигнификатор", orb: 0, phase: "unknown" as const } : calculateAstrologyAspect(querentPlacement.angle, quesitedPlacement.angle, "synastry");
  const futureContact = futureWheel && querentPlanet !== quesitedPlanet
    ? calculateAstrologyAspect(placementFor(futureWheel, querentPlanet).angle, placementFor(futureWheel, quesitedPlanet).angle, "synastry")
    : null;
  const receptions: string[] = [];
  if (RULER_BY_SIGN[querentPlacement.signKey] === quesitedPlanet) receptions.push(`${PLANET_LABEL[querentPlanet]} находится в знаке ${PLANET_LABEL[quesitedPlanet]}: кверент ориентирован на предмет вопроса.`);
  if (RULER_BY_SIGN[quesitedPlacement.signKey] === querentPlanet) receptions.push(`${PLANET_LABEL[quesitedPlanet]} находится в знаке ${PLANET_LABEL[querentPlanet]}: предмет вопроса отвечает интересу кверента.`);
  if (!receptions.length) receptions.push("Взаимной рецепции по обители между главными сигнификаторами нет.");
  const moon = placementFor(wheel, "moon");
  const moonContacts = (["sun", "mercury", "venus", "mars", "jupiter", "saturn"] as TraditionalPlanet[]).flatMap((planet) => {
    const aspect = calculateAstrologyAspect(moon.angle, placementFor(wheel, planet).angle, "synastry");
    if (!aspect) return [];
    const futureAspect = futureWheel ? calculateAstrologyAspect(placementFor(futureWheel, "moon").angle, placementFor(futureWheel, planet).angle, "synastry") : null;
    const phase: "applying" | "separating" | "unknown" = futureAspect?.kind === aspect.kind ? (futureAspect.orb < aspect.orb ? "applying" : "separating") : "unknown";
    return [{ planet: PLANET_LABEL[planet], kind: aspect.label.toLowerCase(), orb: Number(aspect.orb.toFixed(2)), phase }];
  }).sort((a, b) => a.orb - b.orb);
  const degree = ascendantDegree % 30;
  return {
    method: "eterapy-horary-traditional-v1",
    question: input.match(/Вопрос:\s*(.+)/iu)?.[1]?.trim() ?? input.trim(),
    category: input.match(/Категория:\s*(.+)/iu)?.[1]?.trim() ?? "другое",
    subjectHouse: house,
    ascendantDegree,
    ascendantSign: wheel.ascendant?.name ?? houseCusp.signName,
    radicality: degree < 3 ? "early" : degree > 27 ? "late" : "ordinary",
    querent: { planet: querentPlanet, label: PLANET_LABEL[querentPlanet], placement: querentPlacement, dignity: dignity(querentPlanet, querentPlacement) },
    quesited: { planet: quesitedPlanet, label: PLANET_LABEL[quesitedPlanet], placement: quesitedPlacement, dignity: dignity(quesitedPlanet, quesitedPlacement) },
    contact: contact ? {
      kind: "label" in contact ? contact.label.toLowerCase() : contact.kind,
      orb: Number(contact.orb.toFixed(2)),
      phase: "phase" in contact ? contact.phase : futureContact?.kind === contact.kind ? (futureContact.orb < contact.orb ? "applying" : "separating") : "unknown",
    } : null,
    receptions,
    moonContacts,
  };
}

export function horaryFactsForAI(facts: HoraryJudgementFacts) {
  return [
    "ТОЧНО РАССЧИТАНО ДЛЯ ХОРАРНОЙ КАРТЫ (не меняй сигнификаторы и дома):",
    `Выбранный по категории вопроса дом предмета: ${facts.subjectHouse}.`,
    `ASC: ${facts.ascendantSign} ${Number((facts.ascendantDegree % 30).toFixed(2))}°. Радикальность по степени ASC: ${RADICALITY_LABEL[facts.radicality]}.`,
    `Кверент: ${facts.querent.label}, ${facts.querent.placement.signName} ${Number(facts.querent.placement.degreeInSign.toFixed(2))}°, ${facts.querent.dignity}.`,
    `Предмет вопроса: ${facts.quesited.label}, ${facts.quesited.placement.signName} ${Number(facts.quesited.placement.degreeInSign.toFixed(2))}°, ${facts.quesited.dignity}.`,
    facts.contact ? `Мажорный контакт сигнификаторов: ${facts.contact.kind}, орб ${facts.contact.orb}°, фаза: ${PHASE_LABEL[facts.contact.phase]}.` : "Текущего мажорного контакта сигнификаторов в заданном орбисе нет.",
    `Рецепции: ${facts.receptions.join(" ")}`,
    `Мажорные контакты Луны: ${facts.moonContacts.length ? facts.moonContacts.map((item) => `${item.planet} — ${item.kind}, орб ${item.orb}°, ${PHASE_LABEL[item.phase]}`).join("; ") : "нет в заданных орбисах"}.`,
    "Схождение или расхождение рассчитано сравнением эфемерид через 10 минут. Точный календарный срок автоматически не вычислен: не выдумывай его; дай только осторожный диапазон или прямо обозначь границу расчёта.",
  ].join("\n");
}
