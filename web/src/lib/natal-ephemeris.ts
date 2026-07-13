import {
  Body,
  EclipticGeoMoon,
  GeoVector,
  MakeTime,
  Rotation_EQD_ECT,
  Rotation_EQJ_EQD,
  RotateVector,
  SiderealTime,
  SunPosition,
  type AstroTime,
} from "astronomy-engine";
import {
  CHART_LUMINARIES,
  ZODIAC_SIGNS,
  parseBirthDate,
  type ChartPlacement,
  type NatalWheel,
  type SynastryWheel,
  type ZodiacSign,
} from "@/lib/esoteric-chart";
import { parseHumanDesignBirth } from "@/lib/human-design";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

const ZODIAC_RUSSIAN_STEMS: Record<string, string> = {
  "Овен": "овн",
  "Телец": "тельц",
  "Близнецы": "близнец",
  "Рак": "рак",
  "Лев": "льв",
  "Дева": "дев",
  "Весы": "вес",
  "Скорпион": "скорпион",
  "Стрелец": "стрельц",
  "Козерог": "козерог",
  "Водолей": "водол",
  "Рыбы": "рыб",
};

export function textMentionsZodiacSign(text: string, signName: string) {
  const stem = ZODIAC_RUSSIAN_STEMS[signName] ?? signName.toLocaleLowerCase("ru");
  return text.toLocaleLowerCase("ru").includes(stem);
}

const CITY_COORDINATES: Array<{ match: RegExp; latitude: number; longitude: number }> = [
  { match: /кишин[её]в|chisinau|chișinău/i, latitude: 47.0105, longitude: 28.8638 },
  { match: /москв|moscow/i, latitude: 55.7558, longitude: 37.6173 },
  { match: /санкт[-\s]?петербург|петербург|спб|saint petersburg/i, latitude: 59.9343, longitude: 30.3351 },
  { match: /минск|minsk/i, latitude: 53.9006, longitude: 27.5590 },
  { match: /киев|kyiv|kiev/i, latitude: 50.4501, longitude: 30.5234 },
  { match: /одесс|odesa|odessa/i, latitude: 46.4825, longitude: 30.7233 },
  { match: /тбилиси|tbilisi/i, latitude: 41.7151, longitude: 44.8271 },
  { match: /ереван|yerevan/i, latitude: 40.1872, longitude: 44.5152 },
  { match: /баку|baku/i, latitude: 40.4093, longitude: 49.8671 },
  { match: /алмат|almaty/i, latitude: 43.2220, longitude: 76.8512 },
  { match: /астана|astana/i, latitude: 51.1694, longitude: 71.4491 },
  { match: /берлин|berlin/i, latitude: 52.5200, longitude: 13.4050 },
  { match: /лондон|london/i, latitude: 51.5074, longitude: -0.1278 },
];

const PLANET_BODIES: Array<{ key: string; body: Body | null }> = [
  { key: "sun", body: null },
  { key: "moon", body: Body.Moon },
  { key: "mercury", body: Body.Mercury },
  { key: "venus", body: Body.Venus },
  { key: "mars", body: Body.Mars },
  { key: "jupiter", body: Body.Jupiter },
  { key: "saturn", body: Body.Saturn },
  { key: "uranus", body: Body.Uranus },
  { key: "neptune", body: Body.Neptune },
  { key: "pluto", body: Body.Pluto },
];

const ASPECTS = [
  { name: "соединение", angle: 0, orb: 7, harmony: "flow" as const },
  { name: "секстиль", angle: 60, orb: 5, harmony: "flow" as const },
  { name: "квадрат", angle: 90, orb: 6, harmony: "tension" as const },
  { name: "тригон", angle: 120, orb: 6, harmony: "flow" as const },
  { name: "оппозиция", angle: 180, orb: 7, harmony: "tension" as const },
];

function norm360(value: number) {
  return ((value % 360) + 360) % 360;
}

function eclipticLongitudeOfDate(time: AstroTime, body: Body) {
  if (body === Body.Moon) return norm360(EclipticGeoMoon(time).lon);
  const eqj = GeoVector(body, time, true);
  const eqd = RotateVector(Rotation_EQJ_EQD(time), eqj);
  const ect = RotateVector(Rotation_EQD_ECT(time), eqd);
  return norm360(Math.atan2(ect.y, ect.x) * RAD2DEG);
}

function zodiacForLongitude(longitude: number): ZodiacSign {
  return ZODIAC_SIGNS[Math.floor(norm360(longitude) / 30) % 12];
}

function placementsAt(time: AstroTime): ChartPlacement[] {
  return PLANET_BODIES.map(({ key, body }) => {
    const luminary = CHART_LUMINARIES.find((item) => item.key === key)!;
    const longitude = key === "sun"
      ? norm360(SunPosition(time).elon)
      : eclipticLongitudeOfDate(time, body!);
    const sign = zodiacForLongitude(longitude);
    return {
      luminary: key,
      glyph: luminary.glyph,
      label: luminary.label,
      signKey: sign.key,
      signName: sign.name,
      signGlyph: sign.glyph,
      angle: longitude,
      degreeInSign: longitude % 30,
    };
  });
}

function resolveCoordinates(input: string) {
  return CITY_COORDINATES.find((city) => city.match.test(input)) ?? null;
}

function ascendantLongitude(time: AstroTime, latitude: number, longitude: number) {
  const localSidereal = norm360(SiderealTime(time) * 15 + longitude) * DEG2RAD;
  const latitudeRad = latitude * DEG2RAD;
  const obliquity = 23.4392911 * DEG2RAD;
  const raw = Math.atan2(
    -Math.cos(localSidereal),
    Math.sin(localSidereal) * Math.cos(obliquity) + Math.tan(latitudeRad) * Math.sin(obliquity),
  ) * RAD2DEG;
  return norm360(raw + 180);
}

function equalHouses(ascendant: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const cusp = norm360(ascendant + index * 30);
    return { number: index + 1, cusp, signName: zodiacForLongitude(cusp).name };
  });
}

export function buildNatalEphemerisWheel(birthData: string): NatalWheel {
  const parsedDate = parseBirthDate(birthData);
  const parsedBirth = parseHumanDesignBirth(birthData);
  if (!parsedBirth.utc) {
    throw new Error("Полная дата рождения не распознана");
  }

  const time = MakeTime(parsedBirth.utc);
  const placements = placementsAt(time);
  const sun = placements.find((placement) => placement.luminary === "sun")!;
  const sunSign = zodiacForLongitude(sun.angle);
  const coordinates = parsedBirth.hasExactTime ? resolveCoordinates(birthData) : null;
  const ascendantDegree = coordinates
    ? ascendantLongitude(time, coordinates.latitude, coordinates.longitude)
    : null;

  return {
    kind: "natal",
    calculation: "ephemeris",
    sunSign,
    ascendant: ascendantDegree === null ? null : zodiacForLongitude(ascendantDegree),
    ascendantDegree,
    houses: ascendantDegree === null ? undefined : equalHouses(ascendantDegree),
    placements,
    parsed: parsedDate,
  };
}

function angleDelta(a: number, b: number) {
  const raw = Math.abs(norm360(a - b));
  return raw > 180 ? 360 - raw : raw;
}

export function buildSynastryEphemerisWheel(aData: string, bData: string): SynastryWheel {
  const a = buildNatalEphemerisWheel(aData);
  const b = buildNatalEphemerisWheel(bData);
  const aspects = a.placements.flatMap((from) => b.placements.flatMap((to) => {
    const delta = angleDelta(from.angle, to.angle);
    const aspect = ASPECTS
      .map((candidate) => ({ ...candidate, difference: Math.abs(delta - candidate.angle) }))
      .filter((candidate) => candidate.difference <= candidate.orb)
      .sort((left, right) => left.difference - right.difference)[0];
    if (!aspect) return [];
    return [{
      from: from.angle,
      to: to.angle,
      harmony: aspect.harmony,
      fromLuminary: from.luminary,
      toLuminary: to.luminary,
      kind: aspect.name,
      orb: Number(aspect.difference.toFixed(2)),
    }];
  }));

  return {
    kind: "synastry",
    a: { sunSign: a.sunSign, placements: a.placements },
    b: { sunSign: b.sunSign, placements: b.placements },
    aspects: aspects.sort((left, right) => (left.orb ?? 99) - (right.orb ?? 99)).slice(0, 28),
  };
}
