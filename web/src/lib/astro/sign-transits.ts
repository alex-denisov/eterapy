/**
 * B711 · Периоды «планета в знаке».
 *
 * ЗАЧЕМ. Корпус страниц «планета в знаке» (120 ячеек, «луна в скорпионе»
 * 11 636 показов/мес) обязан отличаться от десятка сайтов, пересказывающих один
 * и тот же учебник. Отличие даёт не текст, а СЧИТАННЫЕ данные: точные интервалы,
 * когда светило действительно стояло в этом знаке. У Плутона это исторический
 * период на поколение, у Луны — ближайшие двое суток. Ни то, ни другое нельзя
 * переписать из чужой статьи, и ровно такие таблицы ИИ-движки цитируют охотнее
 * прозы.
 *
 * ⚠ Ретроградность здесь не аномалия, а обычный случай: Меркурий, Венера и Марс
 * входят в знак, выходят и возвращаются. Поэтому функция отдаёт СПИСОК
 * интервалов, а не один «период». Реализация, считающая вход и выход по одному
 * разу, потеряла бы вторую половину визита и соврала бы датами.
 */
import { MakeTime } from "astronomy-engine";
import { ZODIAC_SIGNS } from "@/lib/esoteric-chart";
import { longitudeOfPlanet, norm360 } from "@/lib/astro/ecliptic";

export type SignTransit = {
  /** Момент входа в знак. Равен началу окна, если вход случился до него. */
  start: Date;
  /** Момент выхода. Равен концу окна, если выход случится после него. */
  end: Date;
  /** Интервал упирается в границу окна, а не в настоящий вход/выход. */
  clampedStart: boolean;
  clampedEnd: boolean;
};

/**
 * Шаг грубого прохода, часы. Подобран так, чтобы САМЫЙ короткий визит светила в
 * знак нельзя было перешагнуть: Луна проходит знак примерно за 2,2 суток,
 * быстрые планеты на ретроградной петле — за две недели и больше.
 */
const COARSE_STEP_HOURS: Record<string, number> = {
  moon: 3,
  sun: 12,
  mercury: 12,
  venus: 12,
  mars: 24,
  jupiter: 48,
  saturn: 48,
  uranus: 120,
  neptune: 120,
  pluto: 120,
};

/** Точность уточнения границы. Минуты хватает: даты показываются по суткам. */
const BOUNDARY_PRECISION_MS = 60_000;

const HOUR_MS = 3_600_000;

function signIndexAt(planetKey: string, at: Date): number {
  const longitude = longitudeOfPlanet(planetKey, MakeTime(at));
  return Math.floor(norm360(longitude) / 30) % 12;
}

export function signIndexByKey(signKey: string): number {
  const index = ZODIAC_SIGNS.findIndex((sign) => sign.key === signKey);
  if (index < 0) throw new Error(`Неизвестный знак: ${signKey}`);
  return index;
}

/**
 * Момент смены знака между `before` и `after`, уточнённый делением пополам.
 * На вход подаются две точки, про которые уже известно, что знак в них разный.
 */
function refineBoundary(planetKey: string, targetIndex: number, before: Date, after: Date): Date {
  let low = before.getTime();
  let high = after.getTime();
  const lowInside = signIndexAt(planetKey, before) === targetIndex;
  while (high - low > BOUNDARY_PRECISION_MS) {
    const mid = low + Math.floor((high - low) / 2);
    const midInside = signIndexAt(planetKey, new Date(mid)) === targetIndex;
    if (midInside === lowInside) low = mid;
    else high = mid;
  }
  return new Date(high);
}

/**
 * Все интервалы, когда светило стояло в знаке внутри окна `[from, to]`.
 *
 * Интервалы, начавшиеся до окна или не кончившиеся внутри него, обрезаются по
 * границе и помечаются `clampedStart` / `clampedEnd` — без этого страница
 * Плутона в Скорпионе показала бы датой входа начало окна, то есть соврала бы.
 */
export function signTransits(
  planetKey: string,
  signKey: string,
  from: Date,
  to: Date,
): SignTransit[] {
  if (!(from.getTime() < to.getTime())) {
    throw new Error("Окно поиска пустое: `from` должен быть раньше `to`");
  }
  const targetIndex = signIndexByKey(signKey);
  const stepMs = (COARSE_STEP_HOURS[planetKey] ?? 24) * HOUR_MS;

  const transits: SignTransit[] = [];
  let previous = from;
  let previousInside = signIndexAt(planetKey, from) === targetIndex;
  let openStart: Date | null = previousInside ? from : null;
  let openClampedStart = previousInside;

  for (let cursorMs = from.getTime() + stepMs; ; cursorMs += stepMs) {
    const isLast = cursorMs >= to.getTime();
    const cursor = isLast ? to : new Date(cursorMs);
    const inside = signIndexAt(planetKey, cursor) === targetIndex;

    if (inside !== previousInside) {
      const boundary = refineBoundary(planetKey, targetIndex, previous, cursor);
      if (inside) {
        openStart = boundary;
        openClampedStart = false;
      } else if (openStart) {
        transits.push({
          start: openStart,
          end: boundary,
          clampedStart: openClampedStart,
          clampedEnd: false,
        });
        openStart = null;
      }
    }

    previous = cursor;
    previousInside = inside;
    if (isLast) break;
  }

  if (openStart) {
    transits.push({ start: openStart, end: to, clampedStart: openClampedStart, clampedEnd: true });
  }
  return transits;
}

/** Знак, в котором светило стоит в указанный момент. */
export function planetSignAt(planetKey: string, at: Date) {
  return ZODIAC_SIGNS[signIndexAt(planetKey, at)];
}
