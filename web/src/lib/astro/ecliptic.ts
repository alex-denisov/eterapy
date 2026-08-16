/**
 * B711 · Общие эклиптические примитивы.
 *
 * До этого модуля перевод «тело + момент → долгота → знак» жил единственной
 * копией внутри `natal-ephemeris.ts` и был закрыт для всех остальных. Корпусу
 * страниц «планета в знаке» нужен тот же расчёт, но по диапазону дат, а не по
 * одному моменту рождения, — поэтому примитивы вынесены сюда, а не скопированы.
 * Вторая копия разошлась бы с первой молча: колесо на странице услуги и таблица
 * периодов в справочнике считали бы одно и то же по-разному.
 *
 * Модуль намеренно тощий: только `astronomy-engine` и таблица знаков. Ни
 * геокодирования, ни Human Design, ни базы — его можно звать и из сборки
 * статики, и из клиента.
 */
import {
  Body,
  EclipticGeoMoon,
  GeoVector,
  Rotation_EQD_ECT,
  Rotation_EQJ_EQD,
  RotateVector,
  SunPosition,
  type AstroTime,
} from "astronomy-engine";
import { ZODIAC_SIGNS, type ZodiacSign } from "@/lib/esoteric-chart";

const RAD2DEG = 180 / Math.PI;

/** Ключи светил совпадают с `CHART_LUMINARIES`, порядок тоже. */
export const PLANET_BODIES: ReadonlyArray<{ key: string; body: Body | null }> = [
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
] as const;

export function norm360(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function eclipticLongitudeOfDate(time: AstroTime, body: Body): number {
  if (body === Body.Moon) return norm360(EclipticGeoMoon(time).lon);
  const eqj = GeoVector(body, time, true);
  const eqd = RotateVector(Rotation_EQJ_EQD(time), eqj);
  const ect = RotateVector(Rotation_EQD_ECT(time), eqd);
  return norm360(Math.atan2(ect.y, ect.x) * RAD2DEG);
}

export function zodiacForLongitude(longitude: number): ZodiacSign {
  return ZODIAC_SIGNS[Math.floor(norm360(longitude) / 30) % 12];
}

/**
 * Долгота светила по его ключу. Солнце считается через `SunPosition`, а не
 * через `GeoVector(Body.Sun)`: у второго начало отсчёта другое.
 */
export function longitudeOfPlanet(planetKey: string, time: AstroTime): number {
  const entry = PLANET_BODIES.find((item) => item.key === planetKey);
  if (!entry) throw new Error(`Неизвестное светило: ${planetKey}`);
  if (entry.body === null) return norm360(SunPosition(time).elon);
  return eclipticLongitudeOfDate(time, entry.body);
}
