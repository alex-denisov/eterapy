/**
 * B767 — области жизни для сцен Threads.
 *
 * Стартовый список (28) утверждён владельцем 2026-10-12, но он не закрыт: новые
 * области предлагает разведчик. Предложенная область становится рабочей либо по
 * кнопке/команде владельца, либо сама — если разведчик независимо встретил её в
 * нескольких проходах за неделю. Квоты недели считаются по реакции владельца
 * (вердикты B764), но у каждой области есть минимум на пробу.
 */

import db from "@/lib/db";

export const THREADS_LIFE_AREAS_KEY = "THREADS_LIFE_AREAS";

export const STARTER_AREAS: readonly string[] = [
  "бывший", "нынешние отношения", "свидания и приложения", "родственники и свекровь", "подруги",
  "соседи", "работа", "начальница", "коллеги", "деньги и долги", "быт", "питомцы",
  "телефон и голосовые", "соцсети и сторис", "внешность и спорт", "сон и ночь", "отпуск",
  "праздники и подарки", "дни рождения", "родители и детство", "переезд и жильё",
  "учёба и смена профессии", "самооценка и возраст", "суеверия и приметы", "индустрия гаданий",
  "сезон и погода", "маркетплейсы и доставка", "транспорт", "ожидание против реальности",
];

/** Минимальная доля недели на каждую область: проба, даже если владелец её пока не оценил. */
export const MIN_AREA_SHARE = 0.05;
/** Проход разведчика — раз в двое суток: «независимо» значит в разных проходах. */
export const AUTO_APPROVE_SIGHTINGS = 3;
const SIGHTING_WINDOW_MS = 7 * 86_400_000;

export interface LifeArea {
  name: string;
  status: "approved" | "proposed";
  /** Проходы разведчика, где область встретилась (ISO, не больше 20). */
  sightings: string[];
}

export function normalizeAreaName(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function defaultAreas(): LifeArea[] {
  return STARTER_AREAS.map((name) => ({ name, status: "approved", sightings: [] }));
}

export function parseAreas(raw: string | null | undefined): LifeArea[] {
  if (!raw) return defaultAreas();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultAreas();
    const areas = parsed.filter((item): item is LifeArea => typeof item?.name === "string"
      && (item.status === "approved" || item.status === "proposed"))
      .map((item) => ({ ...item, sightings: Array.isArray(item.sightings) ? item.sightings : [] }));
    return areas.length > 0 ? areas : defaultAreas();
  } catch {
    return defaultAreas();
  }
}

export async function readAreas(): Promise<LifeArea[]> {
  const row = await db.platformSetting.findUnique({ where: { key: THREADS_LIFE_AREAS_KEY } });
  return parseAreas(row?.value);
}

export async function writeAreas(areas: readonly LifeArea[]): Promise<void> {
  const value = JSON.stringify(areas);
  await db.platformSetting.upsert({
    where: { key: THREADS_LIFE_AREAS_KEY },
    create: { key: THREADS_LIFE_AREAS_KEY, value },
    update: { value },
  });
}

export function approvedAreaNames(areas: readonly LifeArea[]): string[] {
  return areas.filter((area) => area.status === "approved").map((area) => area.name);
}

/** Сопоставляет название от модели с утверждённой областью; иначе `null` (кандидат в предложения). */
export function matchApprovedArea(areas: readonly LifeArea[], name: string | undefined): string | null {
  if (!name) return null;
  const key = normalizeAreaName(name);
  return approvedAreaNames(areas).find((area) => normalizeAreaName(area) === key) ?? null;
}

/**
 * Учитывает проход разведчика: названные моделью новые области получают отметку
 * о встрече. Область, встреченная в `AUTO_APPROVE_SIGHTINGS` разных проходах за
 * неделю, утверждается сама. Чистая функция.
 */
export function recordSightings(areas: readonly LifeArea[], proposed: readonly string[], now: Date): LifeArea[] {
  const next = areas.map((area) => ({ ...area, sightings: [...area.sightings] }));
  for (const rawName of proposed) {
    const name = rawName.trim().slice(0, 60);
    const key = normalizeAreaName(name);
    if (!key) continue;
    const existing = next.find((area) => normalizeAreaName(area.name) === key);
    if (existing?.status === "approved") continue;
    const target = existing ?? { name, status: "proposed" as const, sightings: [] };
    if (!existing) next.push(target);
    const cutoff = now.getTime() - SIGHTING_WINDOW_MS;
    const recent = target.sightings.filter((at) => Date.parse(at) >= cutoff);
    // Один проход — одна встреча, сколько бы сцен ни называли область.
    if (!recent.some((at) => at === now.toISOString())) recent.push(now.toISOString());
    target.sightings = recent.slice(-20);
    if (recent.length >= AUTO_APPROVE_SIGHTINGS) target.status = "approved";
  }
  return next;
}

/** Решение владельца: одобрить предложенную область или снять её. */
export function decideArea(areas: readonly LifeArea[], name: string, approve: boolean): LifeArea[] {
  const key = normalizeAreaName(name);
  return approve
    ? areas.map((area) => (normalizeAreaName(area.name) === key ? { ...area, status: "approved" as const } : area))
    : areas.filter((area) => !(normalizeAreaName(area.name) === key && area.status === "proposed"));
}

/**
 * Выбор области для следующей сцены.
 *
 * Вес области — её успех у владельца (`weights`, по умолчанию 1), делённый на
 * число сцен, уже ушедших в неё за неделю. Область, не добравшая `MIN_AREA_SHARE`
 * недели, идёт вне очереди: пробе нужен шанс до оценки. Чистая функция.
 */
export function chooseArea(input: {
  candidates: readonly string[];
  usedThisWeek: Readonly<Record<string, number>>;
  weights?: Readonly<Record<string, number>>;
}): string | null {
  if (input.candidates.length === 0) return null;
  const total = Object.values(input.usedThisWeek).reduce((sum, n) => sum + n, 0);
  const starved = input.candidates.filter((name) => (input.usedThisWeek[name] ?? 0) / Math.max(total, 1) < MIN_AREA_SHARE
    && total >= 1 / MIN_AREA_SHARE);
  const pool = starved.length > 0 ? starved : input.candidates;
  const score = (name: string) => (input.weights?.[name] ?? 1) / (1 + (input.usedThisWeek[name] ?? 0));
  return [...pool].sort((left, right) => score(right) - score(left) || left.localeCompare(right))[0] ?? null;
}

/** Вес области по вердиктам владельца: доля принятых с поправкой на малую выборку; нет данных — 1. */
export function areaWeights(verdicts: ReadonlyArray<{ lifeArea: string | null; decision: string }>): Record<string, number> {
  const stats = new Map<string, { n: number; ok: number }>();
  for (const verdict of verdicts) {
    if (!verdict.lifeArea) continue;
    const entry = stats.get(verdict.lifeArea) ?? { n: 0, ok: 0 };
    entry.n += 1;
    if (verdict.decision === "approve") entry.ok += 1;
    stats.set(verdict.lifeArea, entry);
  }
  const weights: Record<string, number> = {};
  for (const [area, { n, ok }] of stats) weights[area] = (ok + 1) / (n + 2) * 2;
  return weights;
}
