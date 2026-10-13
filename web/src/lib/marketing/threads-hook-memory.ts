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
