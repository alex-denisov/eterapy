/**
 * Серверная проверка лимита инструментов.
 * Гости: нет ограничений на сервере (клиент контролирует через localStorage/AuthModal).
 * Авторизованные: 3 сессии/месяц (или freeToolsLimit из БД: null=3, 0=∞).
 */
import db from "./db";
import { ToolType } from "@prisma/client";

const DEFAULT_LIMIT = 3;

export async function checkAndRecordToolSession(
  userId: string | null,
  tool: ToolType
): Promise<{ allowed: boolean; remaining: number | null }> {
  if (!userId) return { allowed: true, remaining: null }; // Гость — не ограничиваем на сервере

  const month = new Date().toISOString().slice(0, 7); // "2026-04"

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { freeToolsLimit: true },
  });

  const limit = user?.freeToolsLimit === 0 ? Infinity
    : user?.freeToolsLimit ?? DEFAULT_LIMIT;

  const used = await db.toolSession.count({ where: { userId, month } });

  if (used >= limit) {
    return { allowed: false, remaining: 0 };
  }

  // Record
  await db.toolSession.create({ data: { userId, tool, month } });

  const remaining = limit === Infinity ? null : limit - used - 1;
  return { allowed: true, remaining };
}
