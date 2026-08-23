import { AIProvider, Prisma } from "@prisma/client";
import db from "@/lib/db";
import { aiBudgetPeriod } from "@/lib/ai-gateway/domain";
import { MARKETING_PAID_PROVIDERS } from "@/lib/marketing/model-pool";

/**
 * B719 — СУТОЧНЫЙ ПОТОЛОК РАСХОДА НА ПЛАТНЫЙ МАРШРУТ.
 *
 * Требование владельца 2026-08-23, дословно: «суточный потолок расхода в
 * рублях - 10р, OpenAI разрешен как иностранный маршрут, поставь его перед
 * Яндекс с суточным лимитом в 0,03$».
 *
 * ⚠ ПОЧЕМУ ДВЕ ВАЛЮТЫ, А НЕ ОДНА. Владелец назвал потолки в валютах счетов:
 * Yandex выставляет счёт в рублях, OpenAI — в долларах. Свести их к одной
 * валюте можно только курсом, а курс — величина, которой у нас нет: любое
 * зашитое число начнёт врать в тот день, когда изменится, и потолок тихо
 * перестанет быть тем, что назвал владелец. Поэтому каждый маршрут считается
 * в своей валюте, и пересчёта нет вовсе.
 */
export type PaidRouteCurrency = "RUB" | "USD";

export interface PaidRouteCap {
  currency: PaidRouteCurrency;
  /** Потолок в единицах валюты за сутки UTC. */
  limit: number;
  /** Цена входного токена, за 1 000 токенов, в той же валюте. */
  inputPerThousand: number;
  /** Цена выходного токена, за 1 000 токенов, в той же валюте. */
  outputPerThousand: number;
  /** Откуда взяты цены — чтобы их можно было перепроверить, а не поверить. */
  priceSource: string;
}

/**
 * Цены — не оценка и не догадка.
 *
 * YANDEX: прайс Yandex AI Studio на YandexGPT Pro — 0,60 ₽ за 1 000 токенов
 * (Lite — 0,15 ₽). Тот же прайс уже лежит в
 * `model-pricing-reference.ts` в долларовом виде, и обе записи сходятся: их
 * отношение Pro/Lite ровно 4, как у рублёвых цен.
 *
 * OPENAI: цены `gpt-5.4-mini` в открытом прайсе не опубликованы, поэтому взята
 * ПРОВАЙДЕРСКАЯ ОЦЕНКА из `model-pricing-reference.ts` ($1 за миллион на вход,
 * $4 на выход). Оценка здесь завышает расход относительно любой реальной цены
 * mini-класса — и это правильная сторона ошибки: потолок сработает РАНЬШЕ
 * настоящего рубежа, а не позже. Занизить цену значило бы разрешить перерасход
 * молча.
 */
export const MARKETING_PAID_ROUTE_CAPS: Record<string, PaidRouteCap> = {
  [AIProvider.OPENAI]: {
    currency: "USD",
    limit: 0.03,
    inputPerThousand: 0.001,
    outputPerThousand: 0.004,
    priceSource: "model-pricing-reference/provider-estimate (OPENAI $1/$4 за 1M)",
  },
  [AIProvider.YANDEX]: {
    currency: "RUB",
    limit: 10,
    inputPerThousand: 0.6,
    outputPerThousand: 0.6,
    priceSource: "yandex-ai-studio/yandexgpt-pro 0,60 ₽ за 1 000 токенов",
  },
};

export function paidRouteCap(provider: AIProvider): PaidRouteCap | null {
  return MARKETING_PAID_ROUTE_CAPS[provider] ?? null;
}

/**
 * Во что обошлось одно обращение, в валюте счёта провайдера.
 */
export function paidRouteSpend(input: {
  provider: AIProvider;
  promptTokens: number;
  completionTokens: number;
}): number {
  const cap = paidRouteCap(input.provider);
  if (!cap) return 0;
  return ((input.promptTokens * cap.inputPerThousand)
    + (input.completionTokens * cap.outputPerThousand)) / 1000;
}

/**
 * Ключ суточного счётчика. Своя область имён, не пересекающаяся с бюджетами
 * возможностей: там считаются токены на роль, здесь — деньги на провайдера.
 */
export function paidRouteScopeKey(provider: AIProvider): string {
  return `marketing-paid:${provider}`;
}

/**
 * Сколько потрачено на этот маршрут за сутки UTC.
 *
 * Числа хранятся в тысячных долях единицы валюты (`micros` для этой таблицы —
 * целые, а десятые копейки терять нельзя): 10 ₽ = 10 000, $0,03 = 30.
 */
export const PAID_ROUTE_SCALE = 1000;

export async function paidRouteSpentToday(input: {
  provider: AIProvider;
  period?: string;
}, client = db): Promise<number> {
  const period = input.period ?? aiBudgetPeriod();
  const rows = await client.$queryRaw<Array<{ cost_micros: unknown }>>(Prisma.sql`
    SELECT cost_micros FROM ai_budget_ledger
    WHERE scope_type = 'marketing-paid-route'
      AND scope_key = ${paidRouteScopeKey(input.provider)}
      AND period = ${period}
    LIMIT 1
  `);
  const raw = rows[0]?.cost_micros;
  const value = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
  return Number.isFinite(value) ? value / PAID_ROUTE_SCALE : 0;
}

/**
 * Записать расход платного маршрута.
 *
 * ⚠ ЗАПИСЫВАЕМ ДАЖЕ ТОГДА, КОГДА ОБРАЩЕНИЕ НЕ ДАЛО РЕЗУЛЬТАТА. Провайдер берёт
 * деньги за отданные токены, а не за пригодность ответа: обрыв по лимиту
 * вывода оплачен полностью. Считать только удачи значило бы вести потолок по
 * тем расходам, которые нам понравились.
 */
export async function recordPaidRouteSpend(input: {
  provider: AIProvider;
  promptTokens: number;
  completionTokens: number;
  period?: string;
}, client = db): Promise<void> {
  const cap = paidRouteCap(input.provider);
  if (!cap) return;
  const spend = paidRouteSpend(input);
  if (spend <= 0) return;
  const period = input.period ?? aiBudgetPeriod();
  const scaled = Math.ceil(spend * PAID_ROUTE_SCALE);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO ai_budget_ledger (id, scope_type, scope_key, period, tokens, cost_micros, request_count, created_at, updated_at)
    VALUES (gen_random_uuid()::text, 'marketing-paid-route', ${paidRouteScopeKey(input.provider)}, ${period},
            ${input.promptTokens + input.completionTokens}, ${scaled}, 1, NOW(), NOW())
    ON CONFLICT (scope_type, scope_key, period)
    DO UPDATE SET
      tokens = ai_budget_ledger.tokens + EXCLUDED.tokens,
      cost_micros = ai_budget_ledger.cost_micros + EXCLUDED.cost_micros,
      request_count = ai_budget_ledger.request_count + 1,
      updated_at = NOW()
  `);
}

export interface PaidRouteBudgetState {
  provider: AIProvider;
  cap: PaidRouteCap;
  spentToday: number;
  remaining: number;
  exhausted: boolean;
}

/**
 * Какие платные маршруты сегодня ещё можно спрашивать.
 *
 * ⚠ ОТКАЗ ЧТЕНИЯ НЕ ОТКРЫВАЕТ КОШЕЛЁК. Если счётчик прочитать не удалось,
 * маршрут считается исчерпанным. Это обратное правило по сравнению с
 * `marketingProviderOrder`, где пустой список доступных означает «читать не
 * получилось, идём по всему пулу», — и разница намеренная: там ценой ошибки
 * был лишний бесплатный вызов, здесь ценой стали бы деньги владельца.
 */
export async function paidRoutesWithBudgetLeft(input: {
  providers?: readonly AIProvider[];
  period?: string;
} = {}, client = db): Promise<AIProvider[]> {
  const providers = input.providers ?? MARKETING_PAID_PROVIDERS;
  const allowed: AIProvider[] = [];
  for (const provider of providers) {
    const cap = paidRouteCap(provider);
    if (!cap) continue;
    try {
      const spent = await paidRouteSpentToday({ provider, period: input.period }, client);
      if (spent < cap.limit) allowed.push(provider);
    } catch {
      // намеренно молча пропускаем: см. комментарий выше
    }
  }
  return allowed;
}

export async function paidRouteBudgetStates(input: { period?: string } = {}, client = db): Promise<PaidRouteBudgetState[]> {
  const states: PaidRouteBudgetState[] = [];
  for (const provider of MARKETING_PAID_PROVIDERS) {
    const cap = paidRouteCap(provider);
    if (!cap) continue;
    const spentToday = await paidRouteSpentToday({ provider, period: input.period }, client).catch(() => cap.limit);
    states.push({
      provider,
      cap,
      spentToday,
      remaining: Math.max(0, cap.limit - spentToday),
      exhausted: spentToday >= cap.limit,
    });
  }
  return states;
}
