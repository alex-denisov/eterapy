/**
 * B743 — факт по KPI, собранный из живых таблиц.
 *
 * Отдельно от `kpi.ts` по той же причине, по которой `orchestrator-state.ts`
 * отделён от `orchestrator-diagnosis.ts`: определения и суждение обязаны быть
 * чистыми и проверяться прогоном, а поход в базу — нет.
 *
 * ⚠ `null` ВЕЗДЕ, ГДЕ ЗАМЕРА НЕ БЫЛО. Ноль и «не измерили» — разные
 * утверждения, и путаница между ними уже стоила панели доверия (B649): пустой
 * график читался как «нас не показывают», хотя означал «мы не спрашивали».
 * Метрика без замера в отчёте так и называется — «нет замера», и в выполнение
 * не засчитывается ни в какую сторону.
 */

import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { libraryDepth } from "@/lib/library-depth";
import { libraryEntriesWithBackfill } from "@/lib/seo/library-store";
import {
  AGENT_KPIS,
  judgeKpi,
  periodBounds,
  type KpiPeriod,
  type KpiVerdict,
} from "@/lib/marketing/kpi";

/** Доля в процентах, округлённая до целого. `null`, если делить не на что. */
function share(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

async function seoActuals(period: KpiPeriod, now: Date) {
  const { start } = periodBounds(period, now);
  const entries = await libraryEntriesWithBackfill();
  const deep = entries.filter((entry) => libraryDepth(entry).indexable).length;

  const [snapshots, pages] = await Promise.all([
    db.marketingDailySnapshot.findMany({
      where: { capturedAt: { gte: start, lte: now } },
      select: { impressions: true, searchablePages: true },
    }).catch(() => []),
    db.seoLibraryPage.findMany({
      where: { status: "PUBLISHED", publishedAt: { gte: start, lte: now } },
      select: { uniqueness: true },
    }).catch(() => []),
  ]);

  const withVerdict = pages.filter((page) => page.uniqueness !== null);
  const unique = withVerdict.filter(
    (page) => (page.uniqueness as { unique?: unknown } | null)?.unique === true,
  ).length;
  // Последнее НЕ пустое значение: уровень индексации известен не за каждые
  // сутки, и ноль вместо него был бы неправдой (то же решение, что в B697).
  const searchable = snapshots
    .map((row) => row.searchablePages)
    .filter((value): value is number => typeof value === "number")
    .at(-1) ?? null;

  return {
    "seo.indexable_share": share(deep, entries.length),
    "seo.searchable_pages": searchable,
    "seo.impressions": snapshots.length > 0
      ? snapshots.reduce((sum, row) => sum + row.impressions, 0)
      : null,
    "seo.unique_share": withVerdict.length > 0 ? share(unique, withVerdict.length) : null,
  } satisfies Record<string, number | null>;
}

async function smmActuals(period: KpiPeriod, now: Date) {
  const { start } = periodBounds(period, now);
  const rows = await db.externalPublication.findMany({
    where: { planSlot: { not: null }, scheduledFor: { gte: start, lte: now } },
    select: { status: true, notes: true },
  }).catch((error: unknown) => {
    log.warn("kpi.smm_read_failed", { error: serializeError(error) });
    return [] as Array<{ status: string; notes: string | null }>;
  });

  const published = rows.filter((row) => row.status === "PUBLISHED");
  /**
   * ⚠ «Вышло с замечаниями» узнаётся по заметке, а не по отдельному полю: его
   * пишет туда сам конвейер (B713 §3), и заводить второе хранилище того же
   * факта значило бы завести расхождение.
   */
  const withoutApproval = published.filter(
    (row) => (row.notes ?? "").includes("замечани"),
  ).length;

  return {
    "smm.slot_fill": share(published.length, rows.length),
    "smm.approved_share": published.length > 0
      ? share(published.length - withoutApproval, published.length)
      : null,
    // Замечания однотипности живут в заметках того же материала: конвейер
    // кладёт туда всё, с чем материал вышел.
    "smm.sameness_rate": published.length > 0
      ? share(published.filter((row) => (row.notes ?? "").includes("однотип")).length, published.length)
      : null,
    // Замера расхода на материал пока нет: суточный расход платного маршрута
    // не разложен по материалам. Метрика объявлена и честно молчит, пока
    // разложение не появится — выдуманное число здесь хуже пустоты.
    "smm.cost_per_material": null,
  } satisfies Record<string, number | null>;
}

async function orchestratorActuals(period: KpiPeriod, now: Date) {
  const { start } = periodBounds(period, now);
  const [directives, signals] = await Promise.all([
    db.agentDirective.findMany({
      where: { createdAt: { gte: start, lte: now } },
      select: { key: true, status: true },
    }).catch(() => []),
    db.marketingAutomationSignal.count({
      where: { severity: "INCIDENT", status: "OPEN" },
    }).catch(() => null),
  ]);

  const applied = directives.filter((row) => row.status === "APPLIED");
  /**
   * Правка считается сработавшей, если ТА ЖЕ правка больше не предлагалась
   * позже. Ключ устроен как `<сутки>:<что правим>`, поэтому сравниваются
   * суффиксы — то же правило, что в самооценке диагноза.
   */
  const suffix = (key: string) => key.slice(key.indexOf(":") + 1);
  const proposedLater = new Set<string>();
  for (let index = 0; index < directives.length; index += 1) {
    const earlier = directives.slice(index + 1);
    if (earlier.some((row) => suffix(row.key) === suffix(directives[index].key))) {
      proposedLater.add(suffix(directives[index].key));
    }
  }
  const effective = applied.filter((row) => !proposedLater.has(suffix(row.key))).length;

  return {
    "orchestrator.fix_effectiveness": applied.length > 0 ? share(effective, applied.length) : null,
    // Пока список шагов владельца не хранится построчно, эта метрика честно
    // молчит: считать её по одному текущему отчёту значило бы каждый раз
    // показывать «ноль просроченных», что неправда.
    "orchestrator.owner_actions_open": null,
    // Зелёные сутки считаются по открытым инцидентам на момент замера: ряда
    // посуточных состояний контура у нас нет, и строить его задним числом
    // из журнала было бы догадкой.
    "orchestrator.green_days": signals === null ? null : (signals === 0 ? 100 : 0),
  } satisfies Record<string, number | null>;
}

export async function readKpiVerdicts(input: {
  period: KpiPeriod;
  now?: Date;
}): Promise<KpiVerdict[]> {
  const now = input.now ?? new Date();
  const [seo, smm, orchestrator] = await Promise.all([
    seoActuals(input.period, now),
    smmActuals(input.period, now),
    orchestratorActuals(input.period, now),
  ]);
  const actuals: Record<string, number | null> = { ...seo, ...smm, ...orchestrator };
  return AGENT_KPIS.map((definition) => judgeKpi({
    definition,
    period: input.period,
    actual: actuals[definition.id] ?? null,
  }));
}

/** Сколько метрик агента объявлено, но не измеряется. Честность отчёта. */
export function unmeasured(verdicts: readonly KpiVerdict[]): string[] {
  return verdicts.filter((verdict) => verdict.actual === null).map((verdict) => verdict.definition.title);
}
