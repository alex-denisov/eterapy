/**
 * Серверная проверка лимита инструментов.
 *
 * Быстрый расклад (tier=quick): 3/мес бесплатно (или freeToolsLimit из БД: null=3, 0=∞).
 * Полный расклад (tier=full): проверяет баланс пользователя, списывает стоимость.
 *
 * Гости: без ограничений (клиент контролирует через localStorage/AuthModal).
 */
import db from "./db";
import { ToolType } from "@prisma/client";

const DEFAULT_LIMIT = 3;
const FULL_READING_PRICE_KOPECKS = 29900; // 299 ₽ за полный расклад

export type ReadingTier = "quick" | "full";

/** Проверяет и записывает сессию. Для full — списывает баланс. */
export async function checkAndRecordToolSession(
  userId: string | null,
  tool: ToolType,
  tier: ReadingTier = "quick"
): Promise<{ allowed: boolean; remaining: number | null; balanceKopecks?: number; error?: string }> {
  if (!userId) {
    // Гости — только quick, без ограничений
    if (tier === "full") return { allowed: false, remaining: null, error: "Авторизуйтесь для полного расклада" };
    return { allowed: true, remaining: null };
  }

  const month = new Date().toISOString().slice(0, 7); // "2026-04"

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { freeToolsLimit: true, balance: true },
  });

  const limit = user?.freeToolsLimit === 0 ? Infinity
    : user?.freeToolsLimit ?? DEFAULT_LIMIT;

  if (tier === "full") {
    // Полный расклад — проверка баланса
    const currentBalance = user?.balance ?? 0;
    if (currentBalance < FULL_READING_PRICE_KOPECKS) {
      return {
        allowed: false,
        remaining: null,
        balanceKopecks: currentBalance,
        error: `Недостаточно средств. Полный расклад стоит ${(FULL_READING_PRICE_KOPECKS / 100).toLocaleString("ru-RU")} ₽`,
      };
    }

    // Списываем баланс и записываем сессию
    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: { balance: { decrement: FULL_READING_PRICE_KOPECKS } },
      }),
      db.toolSession.create({
        data: { userId, tool, month, tier: "full" },
      }),
    ]);

    return {
      allowed: true,
      remaining: null,
      balanceKopecks: (user?.balance ?? 0) - FULL_READING_PRICE_KOPECKS,
    };
  }

  // Быстрый расклад — проверка лимита
  const used = await db.toolSession.count({ where: { userId, month, tier: "quick" } });

  if (used >= limit) {
    return { allowed: false, remaining: 0, balanceKopecks: user?.balance ?? 0 };
  }

  // Record
  await db.toolSession.create({ data: { userId, tool, month, tier: "quick" } });

  const remaining = limit === Infinity ? null : limit - used - 1;
  return { allowed: true, remaining, balanceKopecks: user?.balance ?? 0 };
}

export function getFullReadingPriceKopecks(): number {
  return FULL_READING_PRICE_KOPECKS;
}
