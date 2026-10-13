/**
 * B777 — намерения хуков последних постов ленты: нужны, чтобы ротировать намерение.
 * Берутся из `notes` материалов (`hookIntent`); сбой чтения — пустой список.
 */

import db from "@/lib/db";
import { HOOK_INTENTS, type HookIntentCode } from "@/lib/marketing/threads-hook-pool";

const KNOWN: ReadonlySet<string> = new Set(HOOK_INTENTS.map((intent) => intent.code));

export async function recentHookIntents(excludePublicationId: string, limit = 6): Promise<HookIntentCode[]> {
  try {
    const rows = await db.externalPublication.findMany({
      where: { platform: "threads", id: { not: excludePublicationId }, notes: { contains: "\"hookIntent\"" } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { notes: true },
    });
    return rows.flatMap((row) => {
      try {
        const intent = (JSON.parse(row.notes ?? "{}") as { hookIntent?: unknown }).hookIntent;
        return typeof intent === "string" && KNOWN.has(intent) ? [intent as HookIntentCode] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Дописывает поля хука в СВЕЖИЕ notes (не перезаписывает снимком, прочитанным до вызовов моделей). */
export async function saveHookFields(publicationId: string, fields: Record<string, unknown>): Promise<void> {
  const row = await db.externalPublication.findUnique({ where: { id: publicationId }, select: { notes: true } });
  let current: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row?.notes ?? "{}");
    if (parsed && typeof parsed === "object") current = parsed as Record<string, unknown>;
  } catch {
    return; // notes не JSON (дописаны строки выпуска) — не трогаем
  }
  await db.externalPublication.update({ where: { id: publicationId }, data: { notes: JSON.stringify({ ...current, ...fields }) } });
}
