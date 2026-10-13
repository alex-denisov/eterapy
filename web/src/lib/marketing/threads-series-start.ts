/**
 * B776 — запуск и остановка серии «День N/30» вместе с уже созданными строками плана.
 *
 * Горизонт Threads — семь суток: строки на них созданы со своими форматами, а
 * сторож очереди формат не пересчитывает. Поэтому при старте/стопе незаписанные
 * строки (DRAFT, ни одной попытки автора) пересобираются по новому плану.
 * Написанные, поставленные в график и вышедшие строки не трогаем: сутки с такой
 * строкой остаются пропущенным номером серии (день считается по МСК-дате).
 */

import db from "@/lib/db";
import { contentPlanFor, type ContentPlanSlot } from "@/lib/marketing/content-plan";
import { loadSeriesConfig, saveSeriesConfig } from "@/lib/marketing/threads-series-store";
import {
  mskDateOf, seriesDayFor, startSeries, stopSeries, type SeriesConfig,
} from "@/lib/marketing/threads-series";

const REFORMAT_KEYS = [
  "format", "editorialAngle", "contentClass", "formatRules", "formatMedia", "formatLink",
  "formatReply", "formatCluster", "technique", "formatSeries", "formatCta",
] as const;

function slotNotes(slot: ContentPlanSlot): Record<string, unknown> {
  const source = slot as unknown as Record<string, unknown>;
  return Object.fromEntries(REFORMAT_KEYS.map((key) => [key, source[key]]));
}

function parseNotes(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function differs(notes: Record<string, unknown>, slot: ContentPlanSlot): boolean {
  const next = slotNotes(slot);
  return REFORMAT_KEYS.some((key) => JSON.stringify(notes[key] ?? null) !== JSON.stringify(next[key] ?? null));
}

/** Пересобирает формат незаписанных строк Threads по плану с заданной серией. Возвращает число строк. */
export async function reformatUnwrittenRows(config: SeriesConfig | null, now: Date): Promise<number> {
  const slots = new Map(contentPlanFor(now, config, { includeToday: true })
    .filter((slot) => slot.channel === "threads").map((slot) => [slot.key, slot]));
  const rows = await db.externalPublication.findMany({
    where: { platform: "threads", status: "DRAFT", attemptCount: 0, planSlot: { not: null }, scheduledFor: { gte: now } },
    select: { id: true, planSlot: true, notes: true },
  });
  let changed = 0;
  for (const row of rows) {
    const slot = row.planSlot ? slots.get(row.planSlot) : undefined;
    const notes = parseNotes(row.notes);
    if (!slot || !notes || !differs(notes, slot)) continue;
    await db.externalPublication.update({
      where: { id: row.id },
      data: { notes: JSON.stringify({ ...notes, ...slotNotes(slot) }) },
    });
    changed += 1;
  }
  return changed;
}

/** Сегодняшний вечерний слот серии ещё можно переформатировать (строка не написана или её нет в плане). */
async function todaySeriesSlotIsOpen(now: Date): Promise<boolean> {
  const today = mskDateOf(now);
  const candidate = startSeries(now, true);
  const slot = contentPlanFor(now, candidate, { includeToday: true })
    .find((item) => item.channel === "threads" && item.formatSeries && item.scheduledAt.slice(0, 10) === today);
  if (!slot || new Date(slot.scheduledAt).getTime() <= now.getTime()) return false;
  const row = await db.externalPublication.findFirst({
    where: { planSlot: slot.key, status: { not: "ARCHIVED" } },
    select: { status: true, attemptCount: true },
  });
  return Boolean(row && row.status === "DRAFT" && row.attemptCount === 0);
}

export interface SeriesCommandResult { reply: string }

export async function startSeriesCommand(now: Date): Promise<SeriesCommandResult> {
  const today = mskDateOf(now);
  const current = await loadSeriesConfig();
  if (current?.active) {
    const day = seriesDayFor(current, today);
    if (day) return { reply: `Серия уже идёт: сегодня День ${day.day}/${day.total}. Счётчик не сбрасываю; «серия стоп» — остановить.` };
    if (current.startDate > today) return { reply: `Серия уже запланирована: День 1 — ${current.startDate}. Счётчик не сбрасываю.` };
  }
  const config = startSeries(now, await todaySeriesSlotIsOpen(now));
  await saveSeriesConfig(config);
  const changed = await reformatUnwrittenRows(config, now);
  const when = config.startDate === today ? "сегодня вечером" : `завтра (${config.startDate})`;
  return { reply: `Принял: серия «День N/${config.days}» стартует ${when}, по одному посту в день в вечерний слот. Пересобрал ${changed} ещё не написанных черновиков; написанные остаются как есть. «Серия стоп» — остановить.` };
}

export async function stopSeriesCommand(now: Date): Promise<SeriesCommandResult> {
  const config = stopSeries(await loadSeriesConfig());
  await saveSeriesConfig(config);
  const changed = await reformatUnwrittenRows(config, now);
  return { reply: `Принял: серия остановлена. Вернул обычный формат ${changed} ещё не написанных черновиков; написанные материалы остаются на модерации.` };
}
