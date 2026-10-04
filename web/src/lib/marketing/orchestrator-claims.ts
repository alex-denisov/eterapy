/**
 * B750 — ОТМЕТКИ ОТЧЁТНОСТИ В БАЗЕ, А НЕ В ПАМЯТИ ПРОЦЕССА.
 *
 * Воркер живёт на нескольких нодах, и каждая хотела бы отправить «сегодняшнюю»
 * презентацию. Память процесса видит только себя, поэтому «уже отправляли»
 * хранится в `platform_settings`, а право отправить берётся сравнением с
 * ожидаемым значением (CAS): выигрывает ровно одна нода, остальные молчат.
 * При отказе доставки значение возвращается — отчёт не должен считаться
 * отправленным, если до владельца он не дошёл.
 */

import db from "@/lib/db";

export const LAST_BRIEF_KEY = "marketing.orchestrator.last_brief_at";
/** После сбоя доставки отчёт по просьбе не повторяется чаще, чем раз в 15 минут. */
export const DELIVERY_RETRY_KEY = "marketing.orchestrator.delivery_retry_at";
export const DELIVERY_RETRY_MS = 15 * 60_000;
export const INCIDENT_KEY_PREFIX = "marketing.orchestrator.incident.";

export async function readSetting(key: string): Promise<string | null> {
  const row = await db.platformSetting
    .findUnique({ where: { key }, select: { value: true } })
    .catch(() => null);
  return row?.value ?? null;
}

export async function writeSetting(key: string, value: string): Promise<void> {
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: "service:marketing-orchestrator" },
    update: { value, updatedBy: "service:marketing-orchestrator" },
  });
}

/**
 * Сравнить-и-записать. `expected` = `null` — строки быть не должно.
 * `true` — право получено именно этим вызовом.
 */
export async function claimSetting(key: string, expected: string | null, next: string): Promise<boolean> {
  try {
    if (expected === null) {
      await db.platformSetting.create({
        data: { key, value: next, updatedBy: "service:marketing-orchestrator" },
      });
      return true;
    }
    const result = await db.platformSetting.updateMany({
      where: { key, value: expected },
      data: { value: next, updatedBy: "service:marketing-orchestrator" },
    });
    return result.count === 1;
  } catch {
    // Уникальный ключ: строку только что создала соседняя нода.
    return false;
  }
}

/** Вернуть значение, взятое под отправку, когда доставка не удалась. */
export async function releaseSetting(key: string, previous: string | null): Promise<void> {
  if (previous === null) {
    await db.platformSetting.deleteMany({ where: { key } }).catch(() => undefined);
    return;
  }
  await writeSetting(key, previous).catch(() => undefined);
}

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface OwnerNoteRow {
  at: string;
  text: string;
}

/** Заметки владельца, записанные диалогом. Мусор в базе не роняет отчёт. */
export function parseOwnerNotes(raw: string | null, since: Date | null): OwnerNoteRow[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is OwnerNoteRow =>
        typeof row === "object" && row !== null
        && typeof (row as OwnerNoteRow).at === "string"
        && typeof (row as OwnerNoteRow).text === "string")
      .filter((row) => {
        const at = parseDate(row.at);
        return at !== null && (since === null || at.getTime() > since.getTime());
      });
  } catch {
    return [];
  }
}
