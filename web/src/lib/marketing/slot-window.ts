/**
 * B645 — слот контент-плана это ОКНО, а невыпущенный материал переносится.
 *
 * Требование владельца от 2026-08-03 звучало двумя частями, и обе про одно:
 *
 * 1. «Неправильно выставлять ARCHIVED, если статья не была выпущена. Если она
 *    хорошая, нужно решедулить, а не отменять». Архив — приговор материалу,
 *    а не способ управлять расписанием. Утверждённый редактором текст не
 *    портится оттого, что коннектор канала был выключен два часа.
 * 2. «Логика слотов должна быть с диапазоном времени: если в течение слота
 *    материал не опубликовался, он идёт в следующий слот в соответствии с его
 *    категорией». Формат слота задан временем суток (`content-plan.ts`:
 *    утренняя карточка / дневная практика / вечерняя история), поэтому выпуск
 *    мимо своего времени обесценивает формат, а не спасает его.
 *
 * Отсюда две величины и одно действие: окно `SLOT_WINDOW_MS`, предел переносов
 * `MAX_SLOT_DEFERRALS` и перенос в ближайший свободный слот ТОГО ЖЕ канала,
 * по возможности того же формата.
 *
 * ⚠ Границы, которые здесь держатся:
 * — переносится только плановый материал (`planSlot` не пуст). Ответ живому
 *   человеку и комментарий слота не имеют вовсе, и откладывать их «до утра»
 *   значило бы заставить человека ждать;
 * — исчерпав право на перенос, материал НЕ архивируется: он выходит поздно,
 *   как только канал ответит (правило B636 «поздно честнее, чем никогда»).
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { contentPlanFor, plannedAtFor, type ContentPlanSlot } from "@/lib/marketing/content-plan";

/**
 * Сколько времени слот остаётся действующим. Два часа — меньше расстояния
 * между соседними слотами любого канала в плане (у Telegram самый плотный
 * график: 08:30 / 13:00 / 20:30), поэтому окно не наезжает на следующий слот.
 */
export const SLOT_WINDOW_MS = 2 * 60 * 60_000;

/**
 * Сколько раз материал можно передвинуть. Дальше двигать бессмысленно: если
 * канал молчит третьи сутки, дело не в расписании. Материал остаётся в очереди
 * и выйдет поздно — архива нет ни на одном шаге.
 */
export const MAX_SLOT_DEFERRALS = 3;

/** Ближе этого к слоту переносить некуда: строка не успеет дойти до выпуска. */
export const DEFERRAL_MIN_LEAD_MS = 5 * 60_000;

export function slotWindowEndsAt(scheduledFor: Date): Date {
  return new Date(scheduledFor.getTime() + SLOT_WINDOW_MS);
}

/**
 * Окно открыто? У строки без времени окна нет вовсе — она выходит на первом
 * же проходе, и это не то же самое, что «окно закрылось».
 */
export function isSlotWindowOpen(input: {
  scheduledFor: Date | null | undefined;
  now: Date;
}): boolean {
  if (!input.scheduledFor) return true;
  return input.now.getTime() <= slotWindowEndsAt(input.scheduledFor).getTime();
}

/** Формат слота лежит в `notes` строки — его записал генератор плана. */
export function publicationFormat(notes: string | null | undefined): string | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { format?: unknown };
    return typeof parsed.format === "string" && parsed.format.trim() ? parsed.format : null;
  } catch {
    return null;
  }
}

/**
 * Слоты-кандидаты для переноса, в порядке предпочтения: сначала тот же формат
 * («утренняя карточка» переезжает в утро, а не в вечер), затем любой слот того
 * же канала. Чужой канал не предлагается никогда — материал написан под
 * площадку.
 */
export function nextSlotCandidates(input: {
  platform: string;
  format: string | null;
  now: Date;
  takenSlotKeys: Iterable<string>;
  plan?: readonly ContentPlanSlot[];
}): ContentPlanSlot[] {
  const platform = input.platform.trim().toLowerCase();
  const taken = new Set(input.takenSlotKeys);
  const earliest = input.now.getTime() + DEFERRAL_MIN_LEAD_MS;
  const plan = input.plan ?? contentPlanFor(input.now);
  const free = plan
    .filter((slot) => slot.channel === platform)
    .filter((slot) => !taken.has(slot.key))
    .filter((slot) => plannedAtFor(slot).getTime() >= earliest)
    .sort((left, right) => plannedAtFor(left).getTime() - plannedAtFor(right).getTime());

  const sameFormat = input.format
    ? free.filter((slot) => slot.format === input.format)
    : [];
  const rest = free.filter((slot) => !sameFormat.includes(slot));
  return [...sameFormat, ...rest];
}

export interface SlotDeferralResult {
  deferred: boolean;
  /** Ключ слота, в который материал переехал. */
  slot?: string;
  scheduledFor?: Date;
  /** Почему перенос не состоялся: предел переносов или свободных слотов нет. */
  reason?: "deferral-limit" | "no-free-slot";
}

/**
 * Перенести материал в следующий подходящий слот.
 *
 * Возвращает `deferred: false`, когда двигать нельзя, — и это не ошибка:
 * вызывающий обязан оставить материал в очереди, а не выбросить его.
 */
export async function deferPublicationToNextSlot(input: {
  publication: {
    id: string;
    key: string;
    platform: string;
    planSlot: string | null;
    notes?: string | null;
    scheduledFor: Date | null;
    deferralCount: number;
  };
  now: Date;
  /** Человеческая причина переноса — она же остаётся в `lastError`. */
  reason: string;
  /** Статус после переноса: утверждённый материал возвращается в очередь. */
  nextStatus: "SCHEDULED" | "DRAFT";
}): Promise<SlotDeferralResult> {
  const { publication, now } = input;
  if (publication.deferralCount >= MAX_SLOT_DEFERRALS) {
    log.warn("marketing.slot_deferral_limit", {
      publicationId: publication.id,
      deferralCount: publication.deferralCount,
    });
    return { deferred: false, reason: "deferral-limit" };
  }

  const takenRows = await db.externalPublication.findMany({
    where: { planSlot: { not: null }, NOT: { id: publication.id } },
    select: { planSlot: true },
  });
  const candidates = nextSlotCandidates({
    platform: publication.platform,
    format: publicationFormat(publication.notes),
    now,
    takenSlotKeys: takenRows
      .map((row) => row.planSlot)
      .filter((slot): slot is string => typeof slot === "string"),
  });
  if (candidates.length === 0) return { deferred: false, reason: "no-free-slot" };

  // Слот уникален в базе. Гонка с генератором — обычное состояние, а не сбой:
  // берём следующий свободный, а не роняем проход.
  for (const slot of candidates.slice(0, 5)) {
    const scheduledFor = plannedAtFor(slot);
    try {
      await db.externalPublication.update({
        where: { id: publication.id },
        data: {
          status: input.nextStatus,
          planSlot: slot.key,
          scheduledFor,
          deferralCount: { increment: 1 },
          lastError: `${input.reason} Материал перенесён в слот ${slot.key} `
            + `(${scheduledFor.toISOString()}), это перенос №${publication.deferralCount + 1}.`,
        },
      });
      log.info("marketing.slot_deferred", {
        publicationId: publication.id,
        from: publication.planSlot,
        to: slot.key,
        scheduledFor: scheduledFor.toISOString(),
        deferralCount: publication.deferralCount + 1,
      });
      return { deferred: true, slot: slot.key, scheduledFor };
    } catch (error) {
      log.warn("marketing.slot_deferral_conflict", {
        publicationId: publication.id,
        slot: slot.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { deferred: false, reason: "no-free-slot" };
}
