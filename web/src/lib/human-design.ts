// B387 (M26) — движок «Дизайна человека». В отличие от символического
// esoteric-chart.ts, здесь считается НАСТОЯЩАЯ методика по реальным эфемеридам
// (astronomy-engine, точность < 1 угловой минуты):
//   1. Личность — положения 13 светил на момент рождения.
//   2. Дизайн — те же светила в момент, когда Солнце было на 88° солнечной дуги
//      раньше рождения (≈ 88 дней; ищется двоичным поиском).
//   3. Каждая долгота → ворота+линия по зодиакальному колесу (HD_GATE_SEQUENCE).
//   4. Канал «определён», если активны ОБА его ворота → оба центра окрашены.
//   5. Тип = связность графа центров (в этом «хитрость» методики: важно не какие
//      центры горят, а как мотор соединён с Горлом и определён ли Сакрал).
//
// Долготы берутся в эклиптике ДАТЫ (истинное равноденствие даты, тропический
// зодиак) — именно так считают публичные HD-калькуляторы. Этот модуль серверный
// (astronomy-engine не должен попадать в клиентский бандл).

import {
  Body,
  GeoMoonState,
  GeoVector,
  GravitySimulator,
  HelioVector,
  MakeTime,
  Rotation_EQD_ECT,
  Rotation_EQJ_EQD,
  RotateState,
  RotateVector,
  StateVector,
  SunPosition,
  Vector,
  type AstroTime,
} from "astronomy-engine";
import {
  HD_BODIES,
  HD_CENTER_ORDER,
  HD_CENTERS,
  HD_CHANNELS,
  HD_GATE_ARC,
  HD_GATE_SEQUENCE,
  HD_GATE_TO_CENTER,
  HD_LINE_ARC,
  HD_PROFILE_LINES,
  HD_START_DEGREE,
  HD_TYPE_INFO,
  HD_AUTHORITY_INFO,
  type HDActivation,
  type HDAuthorityKey,
  type HDBodyKey,
  type HDCenterKey,
  type HDDefinedChannel,
  type HDType,
  type HDVariable,
  type HumanDesignChart,
} from "@/lib/human-design-data";

const RAD2DEG = 180 / Math.PI;
const DAY_MS = 86_400_000;
const MOTOR_CENTERS = new Set<HDCenterKey>(["sacral", "heart", "solar", "root"]);

function norm360(value: number): number {
  return ((value % 360) + 360) % 360;
}

// Эклиптическая долгота даты (истинное равноденствие даты) для планеты/Луны.
function eclipticLongitudeOfDate(time: AstroTime, body: Body): number {
  const eqj = GeoVector(body, time, true); // EQJ, с поправкой на аберрацию (видимое положение)
  const eqd = RotateVector(Rotation_EQJ_EQD(time), eqj); // → экватор даты
  const ect = RotateVector(Rotation_EQD_ECT(time), eqd); // → эклиптика даты
  return norm360(Math.atan2(ect.y, ect.x) * RAD2DEG);
}

// Средний восходящий узел Луны (Meeus, гл. 47), эклиптика даты. Разница mean/true
// узла < ~1.8° и почти не влияет на тип; среднее значение детерминировано и
// совпадает с большинством публичных калькуляторов.
function meanNodeLongitude(time: AstroTime): number {
  const t = time.tt / 36525; // юлианские столетия TT от J2000
  const omega =
    125.0445479 -
    1934.1362891 * t +
    0.0020754 * t * t +
    (t * t * t) / 467441 -
    (t * t * t * t) / 60616000;
  return norm360(omega);
}

// Мгновенный восходящий узел орбиты Луны. Линейная интерполяция между двумя
// реальными пересечениями сохраняла Gate/Line, но искажала более мелкие
// Color/Tone, из которых строятся четыре Variables. Берём нормаль к мгновенной
// орбитальной плоскости h = r × v в эклиптике даты.
function trueNodeLongitude(time: AstroTime): number {
  try {
    const eqj = GeoMoonState(time);
    const eqd = RotateState(Rotation_EQJ_EQD(time), eqj);
    const ecliptic = RotateState(Rotation_EQD_ECT(time), eqd);
    const hx = ecliptic.y * ecliptic.vz - ecliptic.z * ecliptic.vy;
    const hy = ecliptic.z * ecliptic.vx - ecliptic.x * ecliptic.vz;
    return norm360(Math.atan2(hx, -hy) * RAD2DEG);
  } catch {
    return meanNodeLongitude(time);
  }
}

// Mean Black Moon Lilith = mean lunar apogee. This analytic Meeus-style
// polynomial is independent of Swiss Ephemeris and deliberately does not mix
// mean and osculating/"true" Lilith in one product version.
function meanLilithLongitude(time: AstroTime): number {
  const t = time.tt / 36525;
  const meanPerigee =
    83.3532465
    + 4069.0137287 * t
    - 0.01032 * t * t
    - (t * t * t) / 80053
    + (t * t * t * t) / 18_999_000;
  return norm360(meanPerigee + 180);
}

// 2060 Chiron: local two-body propagation from the current public NASA/JPL
// SBDB solution (orbit 171, epoch JD 2461200.5, DE441). It avoids an AGPL
// dependency and any per-reading network request. Chiron is interpretive-only:
// it is shown in the side columns but never changes Type/Authority/Definition.
const CHIRON_JPL = {
  epoch: 2_461_200.5,
  a: 13.68426760850124,
  e: 0.3797656311453571,
  i: 6.930574468846328,
  node: 209.2961258613147,
  peri: 339.2878326589729,
  meanAnomaly: 216.7198966018106,
  meanMotion: 0.0194702593257484,
} as const;

function solveKepler(meanAnomalyRad: number, eccentricity: number) {
  let eccentricAnomaly = meanAnomalyRad;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    eccentricAnomaly -= (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomalyRad)
      / (1 - eccentricity * Math.cos(eccentricAnomaly));
  }
  return eccentricAnomaly;
}

function chironHeliocentricEcliptic(jd: number) {
  const degree = Math.PI / 180;
  const meanAnomaly = norm360(CHIRON_JPL.meanAnomaly + CHIRON_JPL.meanMotion * (jd - CHIRON_JPL.epoch)) * degree;
  const eccentricAnomaly = solveKepler(meanAnomaly, CHIRON_JPL.e);
  const orbitalX = CHIRON_JPL.a * (Math.cos(eccentricAnomaly) - CHIRON_JPL.e);
  const orbitalY = CHIRON_JPL.a * Math.sqrt(1 - CHIRON_JPL.e * CHIRON_JPL.e) * Math.sin(eccentricAnomaly);
  const node = CHIRON_JPL.node * degree;
  const peri = CHIRON_JPL.peri * degree;
  const inclination = CHIRON_JPL.i * degree;
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosPeri = Math.cos(peri);
  const sinPeri = Math.sin(peri);
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);
  return {
    x: (cosNode * cosPeri - sinNode * sinPeri * cosI) * orbitalX
      + (-cosNode * sinPeri - sinNode * cosPeri * cosI) * orbitalY,
    y: (sinNode * cosPeri + cosNode * sinPeri * cosI) * orbitalX
      + (-sinNode * sinPeri + cosNode * cosPeri * cosI) * orbitalY,
    z: sinPeri * sinI * orbitalX + cosPeri * sinI * orbitalY,
  };
}

function chironInitialState() {
  const epochDate = new Date((CHIRON_JPL.epoch - 2_440_587.5) * DAY_MS);
  const epochTime = MakeTime(epochDate);
  const delta = 0.01;
  const before = chironHeliocentricEcliptic(CHIRON_JPL.epoch - delta);
  const current = chironHeliocentricEcliptic(CHIRON_JPL.epoch);
  const after = chironHeliocentricEcliptic(CHIRON_JPL.epoch + delta);
  const velocity = { x: (after.x - before.x) / (2 * delta), y: (after.y - before.y) / (2 * delta), z: (after.z - before.z) / (2 * delta) };
  const obliquity = 23.4392911 * Math.PI / 180;
  const toEqj = (vector: { x: number; y: number; z: number }) => ({
    x: vector.x,
    y: vector.y * Math.cos(obliquity) - vector.z * Math.sin(obliquity),
    z: vector.y * Math.sin(obliquity) + vector.z * Math.cos(obliquity),
  });
  const positionEqj = toEqj(current);
  const velocityEqj = toEqj(velocity);
  return { epochTime, state: new StateVector(positionEqj.x, positionEqj.y, positionEqj.z, velocityEqj.x, velocityEqj.y, velocityEqj.z, epochTime) };
}

// Integrating the JPL osculating state with the Sun and planets is materially
// more accurate across historical birth dates than two-body propagation.
// Chiron is slow and remains outside Saturn, so 20-day steps are sufficient for
// gate/line precision while keeping a chart calculation local and fast.
function chironLongitude(time: AstroTime): number {
  const { epochTime, state } = chironInitialState();
  const simulator = new GravitySimulator(Body.Sun, epochTime, [state]);
  const direction = time.ut < epochTime.ut ? -1 : 1;
  let currentUt = epochTime.ut;
  let result = state;
  while (Math.abs(time.ut - currentUt) > 20) {
    currentUt += direction * 20;
    result = simulator.Update(MakeTime(new Date((2_451_545 + currentUt - 2_440_587.5) * DAY_MS)))[0];
  }
  result = simulator.Update(time)[0];
  const earth = HelioVector(Body.Earth, time);
  const geoEqj = new Vector(result.x - earth.x, result.y - earth.y, result.z - earth.z, time);
  const eqd = RotateVector(Rotation_EQJ_EQD(time), geoEqj);
  const ecliptic = RotateVector(Rotation_EQD_ECT(time), eqd);
  return norm360(Math.atan2(ecliptic.y, ecliptic.x) * RAD2DEG);
}

function bodyLongitude(key: HDBodyKey, time: AstroTime): number {
  switch (key) {
    case "sun":
      return SunPosition(time).elon;
    case "earth":
      return norm360(SunPosition(time).elon + 180);
    case "north_node":
      return trueNodeLongitude(time);
    case "south_node":
      return norm360(trueNodeLongitude(time) + 180);
    case "moon":
      return eclipticLongitudeOfDate(time, Body.Moon);
    case "mercury":
      return eclipticLongitudeOfDate(time, Body.Mercury);
    case "venus":
      return eclipticLongitudeOfDate(time, Body.Venus);
    case "mars":
      return eclipticLongitudeOfDate(time, Body.Mars);
    case "jupiter":
      return eclipticLongitudeOfDate(time, Body.Jupiter);
    case "saturn":
      return eclipticLongitudeOfDate(time, Body.Saturn);
    case "uranus":
      return eclipticLongitudeOfDate(time, Body.Uranus);
    case "neptune":
      return eclipticLongitudeOfDate(time, Body.Neptune);
    case "pluto":
      return eclipticLongitudeOfDate(time, Body.Pluto);
    case "chiron":
      return chironLongitude(time);
    case "lilith":
      return meanLilithLongitude(time);
    default:
      return 0;
  }
}

export function gateLineFromLongitude(longitude: number): { gate: number; line: number } {
  const offset = norm360(longitude - HD_START_DEGREE);
  const gateIndex = Math.floor(offset / HD_GATE_ARC) % 64;
  const within = offset - gateIndex * HD_GATE_ARC;
  const line = Math.min(6, Math.max(1, Math.floor(within / HD_LINE_ARC) + 1));
  return { gate: HD_GATE_SEQUENCE[gateIndex], line };
}

// Момент Дизайна: Солнце на 88° солнечной дуги раньше рождения. Солнце за это
// время проходит ~88 дней, ищем двоичным поиском в окне [−100; −80] дней.
function findDesignTime(birthUtc: Date): AstroTime {
  const personalitySun = SunPosition(MakeTime(birthUtc)).elon;
  const target = norm360(personalitySun - 88);
  let lowMs = birthUtc.getTime() - 100 * DAY_MS;
  let highMs = birthUtc.getTime() - 80 * DAY_MS;
  let midMs = (lowMs + highMs) / 2;
  for (let i = 0; i < 60; i += 1) {
    midMs = (lowMs + highMs) / 2;
    const sun = SunPosition(MakeTime(new Date(midMs))).elon;
    const diff = ((sun - target + 540) % 360) - 180; // (−180, 180]
    if (Math.abs(diff) < 1e-6) break;
    if (diff > 0) highMs = midMs;
    else lowMs = midMs;
  }
  return MakeTime(new Date(midMs));
}

function activationsAt(time: AstroTime, side: "personality" | "design"): HDActivation[] {
  return HD_BODIES.map((body) => {
    const longitude = bodyLongitude(body.key, time);
    const { gate, line } = gateLineFromLongitude(longitude);
    return {
      body: body.key,
      label: body.label,
      glyph: body.glyph,
      longitude,
      gate,
      line,
      side,
    };
  });
}

function activationVariable(activation: HDActivation): HDVariable {
  const offset = norm360(activation.longitude - HD_START_DEGREE);
  const gateWithin = offset % HD_GATE_ARC;
  const lineWithin = gateWithin % HD_LINE_ARC;
  const colorArc = HD_LINE_ARC / 6;
  const color = Math.min(6, Math.max(1, Math.floor(lineWithin / colorArc) + 1));
  const colorWithin = lineWithin % colorArc;
  const toneArc = colorArc / 6;
  const tone = Math.min(6, Math.max(1, Math.floor(colorWithin / toneArc) + 1));
  return { color, tone, direction: tone <= 3 ? "left" : "right" };
}

function definedChannelsFrom(activeGates: Set<number>): HDDefinedChannel[] {
  return HD_CHANNELS.filter(([a, b]) => activeGates.has(a) && activeGates.has(b)).map(([a, b]) => ({
    gates: [a, b] as [number, number],
    centers: [HD_GATE_TO_CENTER[a], HD_GATE_TO_CENTER[b]] as [HDCenterKey, HDCenterKey],
  }));
}

function centerAdjacency(channels: HDDefinedChannel[]): Map<HDCenterKey, Set<HDCenterKey>> {
  const adjacency = new Map<HDCenterKey, Set<HDCenterKey>>();
  for (const { centers } of channels) {
    const [c1, c2] = centers;
    if (c1 === c2) continue;
    if (!adjacency.has(c1)) adjacency.set(c1, new Set());
    if (!adjacency.has(c2)) adjacency.set(c2, new Set());
    adjacency.get(c1)!.add(c2);
    adjacency.get(c2)!.add(c1);
  }
  return adjacency;
}

function throatConnectedToMotor(
  definedCenters: Set<HDCenterKey>,
  adjacency: Map<HDCenterKey, Set<HDCenterKey>>,
): boolean {
  if (!definedCenters.has("throat")) return false;
  const seen = new Set<HDCenterKey>();
  const queue: HDCenterKey[] = ["throat"];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (MOTOR_CENTERS.has(current)) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return false;
}

function determineType(definedCenters: Set<HDCenterKey>, motorToThroat: boolean): HDType {
  if (definedCenters.size === 0) return "reflector";
  const hasSacral = definedCenters.has("sacral");
  if (hasSacral && motorToThroat) return "manifesting-generator";
  if (hasSacral) return "generator";
  if (motorToThroat) return "manifestor";
  return "projector";
}

function determineAuthority(definedCenters: Set<HDCenterKey>, type: HDType): HDAuthorityKey {
  if (type === "reflector") return "lunar";
  if (definedCenters.has("solar")) return "emotional";
  if (definedCenters.has("sacral")) return "sacral";
  if (definedCenters.has("spleen")) return "splenic";
  if (definedCenters.has("heart")) return "ego";
  if (definedCenters.has("g")) return "self";
  return "mental";
}

// Число связных компонент среди определённых центров = «определение».
function definitionLabel(
  definedCenters: Set<HDCenterKey>,
  adjacency: Map<HDCenterKey, Set<HDCenterKey>>,
): string {
  if (definedCenters.size === 0) return "Нет определения";
  const seen = new Set<HDCenterKey>();
  let components = 0;
  for (const center of definedCenters) {
    if (seen.has(center)) continue;
    components += 1;
    const queue: HDCenterKey[] = [center];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of adjacency.get(current) ?? []) {
        if (definedCenters.has(next) && !seen.has(next)) queue.push(next);
      }
    }
  }
  const labels: Record<number, string> = {
    1: "Одиночное определение",
    2: "Раздвоенное определение",
    3: "Тройное определение",
    4: "Четверное определение",
  };
  return labels[components] ?? `${components}-компонентное определение`;
}

// Главная функция: birthUtc — момент рождения в UTC.
export function computeHumanDesign(birthUtc: Date, hasExactTime = true): HumanDesignChart {
  const personalityTime = MakeTime(birthUtc);
  const designTime = findDesignTime(birthUtc);

  const personality = activationsAt(personalityTime, "personality");
  const design = activationsAt(designTime, "design");

  const structuralActivations = [...personality, ...design].filter((activation) => activation.body !== "chiron" && activation.body !== "lilith");
  const activeGates = new Set<number>(structuralActivations.map((activation) => activation.gate));
  const definedChannels = definedChannelsFrom(activeGates);
  const adjacency = centerAdjacency(definedChannels);

  const definedCenters = new Set<HDCenterKey>();
  for (const channel of definedChannels) {
    definedCenters.add(channel.centers[0]);
    definedCenters.add(channel.centers[1]);
  }

  const motorToThroat = throatConnectedToMotor(definedCenters, adjacency);
  const type = determineType(definedCenters, motorToThroat);
  const authority = determineAuthority(definedCenters, type);
  const typeInfo = HD_TYPE_INFO[type];
  const authorityInfo = HD_AUTHORITY_INFO[authority];

  const personalitySunLine = personality.find((a) => a.body === "sun")?.line ?? 1;
  const designSunLine = design.find((a) => a.body === "sun")?.line ?? 1;
  const profile = `${personalitySunLine}/${designSunLine}`;
  const profileName = `${HD_PROFILE_LINES[personalitySunLine]?.name ?? ""} / ${HD_PROFILE_LINES[designSunLine]?.name ?? ""}`.trim();
  const personalityByBody = new Map(personality.map((activation) => [activation.body, activation]));
  const designByBody = new Map(design.map((activation) => [activation.body, activation]));
  const variables = {
    determination: activationVariable(designByBody.get("sun")!),
    environment: activationVariable(designByBody.get("north_node")!),
    motivation: activationVariable(personalityByBody.get("sun")!),
    perspective: activationVariable(personalityByBody.get("north_node")!),
  };

  return {
    type,
    typeName: typeInfo.name,
    strategy: typeInfo.strategy,
    signature: typeInfo.signature,
    notSelf: typeInfo.notSelf,
    typeSummary: typeInfo.summary,
    shareLine: typeInfo.share,
    authority,
    authorityName: authorityInfo.name,
    authorityHint: authorityInfo.hint,
    profile,
    profileName,
    definition: definitionLabel(definedCenters, adjacency),
    centers: HD_CENTER_ORDER.map((key) => ({
      key,
      name: HD_CENTERS[key].name,
      defined: definedCenters.has(key),
      motor: HD_CENTERS[key].motor,
    })),
    definedCenters: [...definedCenters],
    definedChannels,
    activeGates: [...activeGates].sort((a, b) => a - b),
    personality,
    design,
    variables,
    hasExactTime,
  };
}

// ===== Разбор пользовательского ввода (дата, время, часовой пояс) =====

const RU_MONTHS: Record<string, number> = {
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6,
  июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
};

// Небольшая карта частых городов/часовых поясов → смещение UTC (часы).
const CITY_OFFSETS: Array<{ match: RegExp; offset: number }> = [
  { match: /калининград/i, offset: 2 },
  { match: /москв|санкт|петербург|питер|спб|минск|мск/i, offset: 3 },
  { match: /киев|kyiv|kiev|одесс/i, offset: 2 },
  { match: /кишин[её]в|chisinau|chișinău/i, offset: 3 },
  { match: /самар|ижевск/i, offset: 4 },
  { match: /екатеринбург|уфа|челябинск|пермь/i, offset: 5 },
  { match: /омск/i, offset: 6 },
  { match: /новосибирск|красноярск|барнаул/i, offset: 7 },
  { match: /иркутск/i, offset: 8 },
  { match: /якутск|чита/i, offset: 9 },
  { match: /владивосток|хабаровск/i, offset: 10 },
  { match: /алмат|astana|астана|ташкент|tashkent/i, offset: 5 },
  { match: /баку|ереван|тбилиси/i, offset: 4 },
  { match: /лондон|london/i, offset: 0 },
  { match: /берлин|париж|рим|мадрид|варшав/i, offset: 1 },
];

const DEFAULT_OFFSET = 3; // по умолчанию — московское время (основная аудитория)

export type ParsedHumanDesignBirth = {
  utc: Date | null;
  hasExactTime: boolean;
  offsetHours: number;
  display: string;
};

function parseDateParts(text: string): { day: number; month: number; year: number } | null {
  const iso = text.match(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  const dmy = text.match(/\b(\d{1,2})[-./](\d{1,2})[-./](\d{4})\b/);
  if (dmy) {
    return { day: Number(dmy[1]), month: Number(dmy[2]), year: Number(dmy[3]) };
  }
  const ru = text.toLowerCase().match(/\b(\d{1,2})\s+([а-яё]{3,})\.?\s*(\d{4})\b/);
  if (ru) {
    const monthKey = Object.keys(RU_MONTHS).find((key) => ru[2].startsWith(key));
    if (monthKey) return { day: Number(ru[1]), month: RU_MONTHS[monthKey], year: Number(ru[3]) };
  }
  return null;
}

function parseOffset(text: string): number {
  // Явный пояс с префиксом (UTC+5 / GMT-4 / МСК+3). Префикс обязателен, чтобы
  // не спутать смещение с дефисами внутри ISO-даты (1990-05-15).
  const prefixed = text.match(/(?:utc|gmt|мск)\s*([+\-−])\s*(\d{1,2})(?:[:.](\d{2}))?/i);
  if (prefixed) {
    const sign = prefixed[1] === "+" ? 1 : -1;
    const hours = Number(prefixed[2]);
    const minutes = prefixed[3] ? Number(prefixed[3]) / 60 : 0;
    if (Number.isFinite(hours) && hours <= 14) return sign * (hours + minutes);
  }
  // Самостоятельный положительный токен «+3» (в начале, после пробела или скобки).
  const plus = text.match(/(?:^|[\s(（])[+＋]\s?(\d{1,2})(?:[:.](\d{2}))?/);
  if (plus) {
    const hours = Number(plus[1]);
    const minutes = plus[2] ? Number(plus[2]) / 60 : 0;
    if (Number.isFinite(hours) && hours <= 14) return hours + minutes;
  }
  for (const city of CITY_OFFSETS) {
    if (city.match.test(text)) return city.offset;
  }
  return DEFAULT_OFFSET;
}

export function parseHumanDesignBirth(text: string): ParsedHumanDesignBirth {
  const clean = (text ?? "").trim();
  const fixedUtcIso = clean.match(/Момент фиксации UTC:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z)/iu)?.[1];
  if (fixedUtcIso) {
    const utc = new Date(fixedUtcIso);
    if (!Number.isNaN(utc.getTime())) {
      return { utc, hasExactTime: true, offsetHours: 0, display: utc.toISOString() };
    }
  }
  const date = parseDateParts(clean);
  if (!date || date.year < 1900 || date.year > 2100 || date.month < 1 || date.month > 12) {
    return { utc: null, hasExactTime: false, offsetHours: DEFAULT_OFFSET, display: clean };
  }

  // Только формат с двоеточием (10:30): точка как разделитель времени конфликтует
  // с точечной датой 15.05.1990 (там «15.05» выглядело бы как время).
  const timeMatch = clean.match(/\b(\d{1,2}):(\d{2})\b/);
  const hasExactTime = Boolean(timeMatch);
  const hours = hasExactTime ? Math.min(23, Math.max(0, Number(timeMatch![1]))) : 12;
  const minutes = hasExactTime ? Math.min(59, Math.max(0, Number(timeMatch![2]))) : 0;
  const offsetHours = parseOffset(clean);

  // Локальное время − смещение = UTC. Date.UTC нормализует переход через сутки.
  const offsetMinutesTotal = Math.round(offsetHours * 60);
  const utcMs = Date.UTC(date.year, date.month - 1, date.day, hours, minutes) - offsetMinutesTotal * 60_000;
  const utc = new Date(utcMs);

  const display = `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}` +
    (hasExactTime ? `, ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` : "");

  return { utc, hasExactTime, offsetHours, display };
}

// Считать чарт прямо из свободного текста (для AI-инъекции и страницы услуги).
export function computeHumanDesignFromText(text: string): { chart: HumanDesignChart | null; parsed: ParsedHumanDesignBirth } {
  const parsed = parseHumanDesignBirth(text);
  if (!parsed.utc) return { chart: null, parsed };
  return { chart: computeHumanDesign(parsed.utc, parsed.hasExactTime), parsed };
}

export function formatActivation(activation: HDActivation): string {
  return `${activation.gate}.${activation.line}`;
}
