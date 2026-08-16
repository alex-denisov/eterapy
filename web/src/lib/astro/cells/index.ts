/**
 * B711 · Реестр ячеек сетки: адреса, метаданные, соседи, окно таблицы.
 *
 * ⚠ АДРЕС СОБИРАЕТСЯ ИЗ ОСЕЙ, А НЕ ПИШЕТСЯ РУКОЙ. `luna-v-skorpione` — это
 * `slugPart` планеты + `slugPart` знака. Записанный руками у каждой ячейки,
 * он разошёлся бы с осью на первой же опечатке, и страница уехала бы на
 * адрес, которого нет ни в карте сайта, ни в перелинковке. Проверку
 * уникальности держит прогон.
 *
 * ⚠ ВОЛНЫ. Сетка выкатывается по строкам (`B711`, п. «Волны»): выложены
 * только те ячейки, которые кто-то написал. Незаполненная строка не
 * превращается в пустую страницу-заглушку — её просто нет ни в
 * `generateStaticParams`, ни в карте сайта, ни на хабе.
 */
import { MOON_CELLS } from "./moon";
import { planetAxis, signAxis, PLANET_AXES, SIGN_AXES } from "./axes";
import type { GridCell, PlanetAxis, SignAxis } from "./types";

export type { GridCell, GridFaq, PlanetAxis, SignAxis } from "./types";
export { PLANET_AXES, SIGN_AXES, planetAxis, signAxis, planetPast, planetPossessive, textGlyph } from "./axes";

/** Адрес хаба сетки. Совпадает с формулировкой спроса («планеты в знаках»). */
export const GRID_HUB_PATH = "/astro/planety-v-znakah" as const;

/** Все написанные ячейки. Волна 2 добавляется сюда одной строкой. */
export const GRID_CELLS: readonly GridCell[] = [...MOON_CELLS];

export type ResolvedCell = {
  cell: GridCell;
  planet: PlanetAxis;
  sign: SignAxis;
  slug: string;
  path: string;
  heading: string;
  metaTitle: string;
  metaDescription: string;
};

/** `в` → `v`, `во` → `vo`. Спрос пишет «луна во льве», и адрес обязан совпадать. */
function prepositionSlug(sign: SignAxis): string {
  return sign.preposition === "во" ? "vo" : "v";
}

export function cellSlug(planetKey: string, signKey: string): string {
  const sign = signAxis(signKey);
  return `${planetAxis(planetKey).slugPart}-${prepositionSlug(sign)}-${sign.slugPart}`;
}

/**
 * Описание страницы для поиска.
 *
 * Первая фраза прямого ответа берётся как есть: она и написана как ответ на
 * запрос «что значит луна в скорпионе». Хвост про расчёт добавляется ТОЛЬКО
 * если строка после этого укладывается в 158 символов — обрезанное на полуслове
 * описание в выдаче выглядит как брак, а недосказанный хвост хуже его
 * отсутствия.
 */
const DESCRIPTION_TAIL = " Точные даты стояния и расчёт по дате рождения.";
const DESCRIPTION_LIMIT = 158;

function firstSentence(text: string): string {
  const match = text.match(/^[^.]*\./);
  return match ? match[0] : text;
}

export function cellMetaDescription(cell: GridCell): string {
  const lead = firstSentence(cell.answer);
  return lead.length + DESCRIPTION_TAIL.length <= DESCRIPTION_LIMIT ? `${lead}${DESCRIPTION_TAIL}` : lead;
}

export function resolveCell(cell: GridCell): ResolvedCell {
  const planet = planetAxis(cell.planetKey);
  const sign = signAxis(cell.signKey);
  const slug = cellSlug(cell.planetKey, cell.signKey);
  const heading = `${planet.name} ${sign.preposition} ${sign.prepositional}`;
  return {
    cell,
    planet,
    sign,
    slug,
    path: `/astro/${slug}`,
    heading,
    metaTitle: `${heading}: что значит и как рассчитать | ETerapy`,
    metaDescription: cellMetaDescription(cell),
  };
}

const RESOLVED: readonly ResolvedCell[] = GRID_CELLS.map(resolveCell);
const BY_SLUG = new Map(RESOLVED.map((item) => [item.slug, item]));

export function resolvedCells(): readonly ResolvedCell[] {
  return RESOLVED;
}

export function cellBySlug(slug: string): ResolvedCell | null {
  return BY_SLUG.get(slug) ?? null;
}

export function cellByKeys(planetKey: string, signKey: string): ResolvedCell | null {
  return BY_SLUG.get(cellSlug(planetKey, signKey)) ?? null;
}

/** Строки сетки, которые уже выложены: планета и её выложенные знаки по кругу. */
export function gridRows(): Array<{ planet: PlanetAxis; cells: ResolvedCell[] }> {
  return PLANET_AXES.map((planet) => ({
    planet,
    cells: SIGN_AXES.map((sign) => cellByKeys(planet.key, sign.key)).filter(
      (item): item is ResolvedCell => item !== null,
    ),
  })).filter((row) => row.cells.length > 0);
}

/**
 * Соседи по строке: предыдущий и следующий знак зодиака.
 *
 * Соседство берётся по КРУГУ знаков, а не по алфавиту и не по порядку записи:
 * читатель, попавший на «Луну в Скорпионе», ищет рядом Весы и Стрельца.
 */
export function rowNeighbours(current: ResolvedCell): ResolvedCell[] {
  const index = SIGN_AXES.findIndex((sign) => sign.key === current.sign.key);
  const around = [
    SIGN_AXES[(index + SIGN_AXES.length - 1) % SIGN_AXES.length],
    SIGN_AXES[(index + 1) % SIGN_AXES.length],
  ];
  return around
    .map((sign) => cellByKeys(current.planet.key, sign.key))
    .filter((item): item is ResolvedCell => item !== null && item.slug !== current.slug);
}

/**
 * Окно таблицы периодов.
 *
 * ⚠ Окно считается от МОМЕНТА СБОРКИ, а не от константы года. Константу
 * пришлось бы обновлять руками каждое 1 января, и первый же пропущенный год
 * дал бы страницу с прошлогодней таблицей, которая выглядит живой. Страницы
 * пререндерятся на каждой выкатке, поэтому окно едет вместе с ними.
 *
 * Быстрым светилам окно — календарный год: «когда Луна в Скорпионе в этом
 * году» и есть запрос. Медленным — десятилетия вокруг сегодняшнего дня:
 * Плутон в знаке стоит дольше, чем живёт любая таблица на год.
 */
export function transitWindow(planet: PlanetAxis, now: Date): { from: Date; to: Date; label: string } {
  const year = now.getUTCFullYear();
  if (planet.windowYears <= 1) {
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
      label: `${year} год`,
    };
  }
  const half = Math.round(planet.windowYears / 2);
  return {
    from: new Date(Date.UTC(year - half, 0, 1)),
    to: new Date(Date.UTC(year + half, 0, 1)),
    label: `${year - half}–${year + half}`,
  };
}
