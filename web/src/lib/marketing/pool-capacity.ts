/**
 * B699 — можно ли вообще начинать материал.
 *
 * Один вопрос, который задаётся ДО вызова автора: остались ли в пуле две
 * независимые модели. Живёт отдельным файлом, потому что соединяет две вещи
 * разной природы — состояние ключей в базе и чистую таблицу предпочтений
 * `model-pool.ts`, которая ни о какой базе знать не должна.
 */

import db from "@/lib/db";
import { aiBudgetPeriod } from "@/lib/ai-gateway/domain";
import { listProvidersWithActiveCredentials, poolCooldownResumeAt } from "@/lib/ai-gateway/credentials";
import { getDefaultAIRoutingPolicy } from "@/lib/ai-gateway/task-policy";
import { marketingPoolCanSeparateRoles } from "@/lib/marketing/model-pool";
import type { AIProvider } from "@prisma/client";

export interface MarketingPoolAvailability {
  /** Провайдеры, чьи ключи прямо сейчас не остывают. */
  providers: AIProvider[];
  /** Хватает ли их, чтобы редактор получил модель, отличную от модели автора. */
  canSeparateRoles: boolean;
}

export async function marketingPoolAvailability(now?: Date): Promise<MarketingPoolAvailability> {
  const providers = await listProvidersWithActiveCredentials({ now });
  return { providers, canSeparateRoles: marketingPoolCanSeparateRoles(providers) };
}

/**
 * B700 фаза 3 — когда в пуле снова появится живой ключ.
 *
 * Вопрос задаётся только тогда, когда живых ключей НЕТ вовсе: пока хоть один
 * доступен, «дедлайн пула» не значит ничего, и линии незачем спать. `null`
 * поэтому читается однозначно — «ёмкость либо есть сейчас, либо срок неизвестен»,
 * и в обоих случаях решает прежний плоский срок.
 */
export async function marketingPoolResumeAt(now = new Date()): Promise<Date | null> {
  const providers = await listProvidersWithActiveCredentials({ now });
  if (providers.length > 0) return null;
  return poolCooldownResumeAt({ now });
}

/** Роли конвейера, между которыми делится суточный потолок. */
const CONVEYOR_ROLE_FEATURES = ["marketing-agent-writer", "marketing-agent-reviewer"] as const;

/**
 * Сколько обращений к модели стоит один материал в среднем.
 *
 * Два, а не одно: первый круг и один круг правки по замечаниям редактора. Это
 * оценка стоимости, а не норма — фактический расход считается по живым данным
 * ниже, множитель лишь переводит «токены на один вызов» в «токены на материал».
 */
const ROUNDS_PER_MATERIAL = 2;

/**
 * Запасная стоимость вызова, когда живых данных ещё нет.
 *
 * Взято с прода 2026-08-09: у автора 1 825 288 токенов на 282 успешных вызова
 * (≈6 500), у редактора 524 115 на 107 (≈4 900). Округлено вверх: занизить
 * стоимость опаснее, чем завысить, — заниженная разрешает линии производить
 * больше, чем пул вытянет.
 */
const FALLBACK_TOKENS_PER_CALL = 7_000;

export interface MarketingCapacity {
  /** C — сколько материалов пул способен произвести в этот час. */
  perHour: number;
  /** Сколько материалов пул вытянет до конца суток потолка. */
  materialsLeftToday: number;
  providers: AIProvider[];
  canSeparateRoles: boolean;
}

/** Часов до конца суток потолка (`ai_budget_ledger` считает по UTC-дате). */
function hoursLeftInBudgetDay(now: Date): number {
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((endOfDay.getTime() - now.getTime()) / 3_600_000));
}

/**
 * B700 фаза 2 — ёмкость часа, выведенная из остатка квот, а не из константы.
 *
 * Считается по САМОЙ УЗКОЙ роли: материал требует и автора, и редактора, и
 * ёмкости у них раздельные. Ноль в любой из них — ноль материалов, сколько бы
 * ни осталось у другой. Это тот же урок, что и `canSeparateRoles`: писать без
 * редактора значит оплачивать текст, который никто не примет.
 *
 * Ошибка чтения не должна останавливать линию: в этом случае возвращается
 * прежняя константа «2 в час», то есть поведение до правки.
 */
export async function marketingHourlyCapacity(now = new Date()): Promise<MarketingCapacity> {
  const { providers, canSeparateRoles } = await marketingPoolAvailability(now);
  if (!canSeparateRoles) {
    return { perHour: 0, materialsLeftToday: 0, providers, canSeparateRoles };
  }

  try {
    const period = aiBudgetPeriod(now);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

    const perRole = await Promise.all(CONVEYOR_ROLE_FEATURES.map(async (feature) => {
      const [spent, sample] = await Promise.all([
        db.aIBudgetLedger.findUnique({
          where: { scopeType_scopeKey_period: { scopeType: "feature", scopeKey: feature, period } },
          select: { tokens: true },
        }),
        db.aIRequest.aggregate({
          where: { feature, status: "SUCCEEDED", createdAt: { gte: weekAgo } },
          _avg: { totalTokens: true },
        }),
      ]);

      const budget = getDefaultAIRoutingPolicy(feature)?.dailyTokenBudget ?? null;
      const remaining = budget ? Math.max(0, budget - Number(spent?.tokens ?? 0)) : Number.MAX_SAFE_INTEGER;
      const perCall = Math.max(1, Math.round(sample._avg.totalTokens || FALLBACK_TOKENS_PER_CALL));
      return Math.floor(remaining / (perCall * ROUNDS_PER_MATERIAL));
    }));

    const materialsLeftToday = Math.max(0, Math.min(...perRole));
    const perHour = Math.ceil(materialsLeftToday / hoursLeftInBudgetDay(now));
    return { perHour, materialsLeftToday, providers, canSeparateRoles };
  } catch {
    // Прежнее поведение как безопасный ответ: линия продолжает работать по
    // старой норме, а не встаёт из-за неудавшегося вспомогательного запроса.
    return { perHour: 2, materialsLeftToday: 2, providers, canSeparateRoles };
  }
}
