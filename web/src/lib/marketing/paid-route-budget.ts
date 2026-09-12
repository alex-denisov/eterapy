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
  /**
   * B741 — ПОТОЛОК ЗА КАЛЕНДАРНЫЙ МЕСЯЦ. Необязательный.
   *
   * ⚠ ЗАЧЕМ ВТОРОЙ ПОТОЛОК, ЕСЛИ ЕСТЬ СУТОЧНЫЙ. Суточный отвечает на вопрос
   * «сколько мы готовы потерять за один плохой день», месячный — «сколько у
   * нас вообще есть». У Gemini это разные числа и разной природы: суточный
   * назвал владелец ($1), месячный равен размеру бонусного кредита Google
   * Developer Program ($10 в месяц по подписке Google AI Pro). Тридцать
   * суточных потолков дают $30, то есть втрое больше кредита — без месячного
   * ограничителя две трети расхода ушли бы с карты, а не с бонуса.
   */
  monthlyLimit?: number;
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
  /**
   * B741 — GEMINI СТАЛ ПЛАТНЫМ, НЕ ПЕРЕСТАВ БЫТЬ ГОЛОВОЙ.
   *
   * Владелец 2026-09-12 привязал к ключу AI Studio биллинг и подписку Google
   * AI Pro. С этого момента обращения сверх бесплатной квоты оплачиваются, а
   * Gemini у нас — голова ОБЕИХ ролей, то есть самый нагруженный маршрут
   * контура. До этой записи у него не было ни потолка, ни учёта расхода:
   * пул считал его бесплатным по остаточному признаку «не в списке платных».
   *
   * ⚠ ПОТОЛОК ТЕПЕРЬ НЕ РАВЕН «ПЛАТНОМУ ХВОСТУ». Раньше эти понятия совпадали,
   * и `paidRouteBudgetStates` ходил по `MARKETING_PAID_PROVIDERS`. Совпадение
   * было случайным: потолок нужен там, где ИДУТ ДЕНЬГИ, а хвост — это про
   * место в очереди. Gemini платный и при этом первый, поэтому реестр
   * потолков стал самостоятельным списком (`marketingMeteredProviders`).
   *
   * Цены — официальный прайс Gemini Developer API на 3.8-flash, тот же
   * порядок, что в `model-pricing-reference.ts` ($0,30 вход / $2,50 выход за
   * миллион токенов). Оценка по выходу завышена относительно flash-класса
   * намеренно: потолок обязан срабатывать раньше настоящего рубежа.
   */
  [AIProvider.GEMINI]: {
    currency: "USD",
    limit: 1,
    monthlyLimit: 10,
    inputPerThousand: 0.0003,
    outputPerThousand: 0.0025,
    priceSource: "model-pricing-reference/GEMINI $0,30/$2,50 за 1M; месячный потолок = кредит Google AI Pro $10/мес",
  },
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

/** Календарный месяц по UTC — префикс `YYYY-MM` суточных периодов. */
export function paidRouteMonthPrefix(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Сколько потрачено на маршрут за календарный месяц.
 *
 * Складывается из тех же суточных строк: отдельного месячного счётчика нет
 * намеренно. Два счётчика одного расхода однажды разойдутся — и выяснится это
 * по счёту, а не по логу.
 */
export async function paidRouteSpentThisMonth(input: {
  provider: AIProvider;
  month?: string;
}, client = db): Promise<number> {
  const month = input.month ?? paidRouteMonthPrefix();
  const rows = await client.$queryRaw<Array<{ total: unknown }>>(Prisma.sql`
    SELECT COALESCE(SUM(cost_micros), 0) AS total FROM ai_budget_ledger
    WHERE scope_type = 'marketing-paid-route'
      AND scope_key = ${paidRouteScopeKey(input.provider)}
      AND period LIKE ${`${month}-%`}
  `);
  const raw = rows[0]?.total;
  const value = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
  return Number.isFinite(value) ? value / PAID_ROUTE_SCALE : 0;
}

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
  spentThisMonth: number;
  /** Остаток по САМОМУ ЖЁСТКОМУ из двух потолков. */
  remaining: number;
  exhausted: boolean;
  /** Какой именно потолок выбран, если выбран. Нужно словами в отчёте. */
  exhaustedBy: "day" | "month" | null;
}

/**
 * B741 — провайдеры, у которых расход СЧИТАЕТСЯ.
 *
 * Это не то же самое, что платный хвост: хвост — про место в очереди, а
 * счётчик — про деньги. Gemini стоит головой и при этом платный, поэтому
 * реестр берётся из самих потолков, а не из списка хвоста.
 */
export function marketingMeteredProviders(): AIProvider[] {
  return Object.keys(MARKETING_PAID_ROUTE_CAPS) as AIProvider[];
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

/**
 * B719 — СКОЛЬКО ТОКЕНОВ ВЫВОДА ЕЩЁ МОЖНО СЕБЕ ПОЗВОЛИТЬ.
 *
 * ⚠ ПОЧЕМУ ОДНОЙ ПРОВЕРКИ ПЕРЕД ВЫЗОВОМ МАЛО. Потолок спрашивается ДО
 * обращения, а списывается ПОСЛЕ, и между ними стоит целый ответ модели. У
 * SMM-агента потолок вывода — 16 000 токенов (B718), и по оценке $1/$4 за
 * миллион один такой ответ OpenAI стоит около $0,064 — вдвое больше всего
 * суточного лимита в $0,03. То есть «сегодня ещё можно» превращалось бы в
 * двукратный перерасход за одно обращение, и заметили бы мы это уже по счёту.
 *
 * Поэтому остаток переводится в потолок вывода и передаётся вызову. Промпт при
 * этом уже оплачен фактом обращения — его стоимость вычитается из остатка
 * первой, а на вывод идёт то, что уцелело.
 *
 * Возвращает `0`, если на обращение не хватает даже промпта: такой вызов
 * делать нельзя вовсе.
 */
export function paidRouteMaxOutputTokens(input: {
  provider: AIProvider;
  remaining: number;
  promptTokens: number;
  ceiling: number;
}): number {
  const cap = paidRouteCap(input.provider);
  if (!cap) return input.ceiling;
  const promptCost = (input.promptTokens * cap.inputPerThousand) / 1000;
  const leftForOutput = input.remaining - promptCost;
  if (leftForOutput <= 0) return 0;
  if (cap.outputPerThousand <= 0) return input.ceiling;
  const affordable = Math.floor((leftForOutput * 1000) / cap.outputPerThousand);
  return Math.max(0, Math.min(input.ceiling, affordable));
}

/**
 * Состояние потолков по ВСЕМ маршрутам со счётчиком.
 *
 * ⚠ ОТКАЗ ЧТЕНИЯ СЧИТАЕТСЯ ИСЧЕРПАНИЕМ — то же правило, что у
 * `paidRoutesWithBudgetLeft`, и по той же причине: ценой ошибки здесь стали бы
 * деньги владельца, а не лишний бесплатный вызов.
 */
export async function paidRouteBudgetStates(input: { period?: string; month?: string } = {}, client = db): Promise<PaidRouteBudgetState[]> {
  const states: PaidRouteBudgetState[] = [];
  for (const provider of marketingMeteredProviders()) {
    const cap = paidRouteCap(provider);
    if (!cap) continue;
    const spentToday = await paidRouteSpentToday({ provider, period: input.period }, client)
      .catch(() => cap.limit);
    const spentThisMonth = cap.monthlyLimit === undefined
      ? 0
      : await paidRouteSpentThisMonth({ provider, month: input.month }, client)
        .catch(() => cap.monthlyLimit ?? 0);
    const dayLeft = Math.max(0, cap.limit - spentToday);
    const monthLeft = cap.monthlyLimit === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, cap.monthlyLimit - spentThisMonth);
    const remaining = Math.min(dayLeft, monthLeft);
    states.push({
      provider,
      cap,
      spentToday,
      spentThisMonth,
      remaining,
      exhausted: remaining <= 0,
      exhaustedBy: remaining > 0 ? null : (monthLeft <= 0 ? "month" : "day"),
    });
  }
  return states;
}
