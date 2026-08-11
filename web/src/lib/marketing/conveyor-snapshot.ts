/**
 * B700 фаза 5 — суточная сводка конвейера: спрос, ёмкость, буфер, барабан и
 * простой по причинам.
 *
 * Зачем она нужна отдельно от журнала. Числа такта пишутся в строку прохода
 * (`marketing-worker.agent`), но журнал прода эфемерен — он умирает вместе с
 * контейнером при следующей выкатке, и живёт на двух нодах сразу
 * (`reference_prod_logs_two_nodes`). Вопрос «почему линия молчит» задаётся уже
 * ПОСЛЕ того, как она молчала, и ответ на него не должен зависеть от того,
 * успел ли кто-то прочитать логи вовремя.
 *
 * Сводка не хранит историю и ничего не пишет: она пересчитывает состояние линии
 * на момент запроса теми же выборками, которыми пользуется проход
 * (`conveyor-queues.ts`), и тем же тактом (`conveyor-tact.ts`). Второе
 * определение тех же чисел означало бы, что панель рано или поздно покажет не
 * то узкое место, которое действительно связывает линию.
 *
 * Три узких места из тикета названы здесь явно, потому что мера у каждого своя:
 *
 * | Узкое место | Что показывает сводка | Что с этим делать |
 * |---|---|---|
 * | вторая независимая модель для редактора | `canSeparateRoles` | резерв платного провайдера под роль редактора |
 * | суточные квоты бесплатного пула | `capacityPerHour`, `materialsLeftToday` | ждать остывания; такт уже считает от ёмкости |
 * | пропускная способность окон | `buffer`, `ready` | буфер полон — это НЕ простой, а норма |
 */

import db from "@/lib/db";
import {
  conveyorTact,
  MARKETING_MAX_AWAITING_REVIEW,
  type ConveyorBottleneck,
} from "@/lib/marketing/conveyor-tact";
import {
  awaitingReviewFilter,
  dueNowFilter,
  plannedFilter,
  readyForWorkFilter,
} from "@/lib/marketing/conveyor-queues";
import {
  MARKETING_GENERATION_LEAD_MS,
  marketingBufferTarget,
  marketingCapacityPausedUntil,
  marketingGenerationHorizon,
} from "@/lib/marketing/agent";
import { marketingHourlyCapacity } from "@/lib/marketing/pool-capacity";
import { MARKETING_MANUAL_STATUS } from "@/lib/marketing/manual-platforms";

/**
 * Состояния, в которых материал считается готовым к выпуску.
 *
 * Значение берётся из `manual-platforms`, а не пишется строкой: список статусов
 * в двух местах разъезжается молча, и «готового впереди» стало бы на один
 * статус меньше ровно там, где это меняет решение такта.
 */
const APPROVED_STATUSES = ["SCHEDULED", MARKETING_MANUAL_STATUS] as const;

export interface ConveyorSnapshot {
  /** Слоты окна, ещё не доведённые до утверждения. */
  demand: number;
  /** Целевой запас утверждённого впереди — двое суток выпуска по плану. */
  buffer: number;
  /** Утверждённое, стоящее в окне опережения. */
  ready: number;
  /** Написанное и ждущее редактора — незавершённое производство. */
  awaitingReview: number;
  /** Потолок очереди редактора: дальше автор ждёт, а не пишет впрок. */
  maxAwaitingReview: number;
  /** Сколько материалов линия начала за последний час. */
  writtenThisHour: number;
  /** Отложенное за окно опережения — оно не простой, а «ещё рано». */
  deferred: number;
  /** Норма часа и разрешение автору, посчитанные тактом. */
  perHour: number;
  writerBudget: number;
  /** Ёмкость пула по самой узкой роли. */
  capacityPerHour: number;
  materialsLeftToday: number;
  /** Есть ли у редактора модель, отличная от модели автора. */
  canSeparateRoles: boolean;
  /** Что связывает линию прямо сейчас. */
  bottleneck: ConveyorBottleneck;
  /** До какого момента линия не зовёт модели вовсе. */
  pausedUntil: Date | null;
  /** Человеческая причина простоя — ровно одна, самая связывающая. */
  idleReason: string;
}

/**
 * Почему линия не производит прямо сейчас.
 *
 * Причина ОДНА и она самая связывающая: список причин заставил бы владельца
 * выбирать, какую чинить, — а на конвейере имеет смысл чинить только узкое
 * место. Порядок проверки идёт от самого жёсткого ограничения к самому мягкому.
 */
function idleReasonFor(input: {
  pausedUntil: Date | null;
  writerBudget: number;
  bottleneck: ConveyorBottleneck;
  awaitingReview: number;
  maxAwaitingReview: number;
  canSeparateRoles: boolean;
}): string {
  if (input.pausedUntil) {
    const until = input.pausedUntil.toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      dateStyle: "short",
      timeStyle: "short",
    });
    return `Линия на паузе до ${until} МСК — столько назвал сам провайдер, отказавший по ёмкости.`;
  }
  if (!input.canSeparateRoles) {
    return "У редактора нет модели, отличной от модели автора: роли разделить нечем, и линия не начинает нового.";
  }
  if (input.writerBudget > 0) {
    return `Линия работает: автору разрешено ${input.writerBudget} материала в этот час.`;
  }
  if (input.bottleneck === "buffer") {
    return "Запас впереди полон — это норма, а не простой. Писать больше значит жечь квоту на материал, который успеет устареть.";
  }
  if (input.bottleneck === "drum") {
    return `Очередь редактора полна (${input.awaitingReview} из ${input.maxAwaitingReview}): написанное ждёт проверки, и новое писать некуда.`;
  }
  if (input.bottleneck === "capacity") {
    return "Ёмкость пула на этот час исчерпана: суточные потолки бесплатных провайдеров выжжены.";
  }
  return "Спрос окна закрыт: незанятых слотов в окне опережения нет.";
}

export async function conveyorSnapshot(input: { now?: Date } = {}): Promise<ConveyorSnapshot> {
  const now = input.now ?? new Date();
  const horizon = marketingGenerationHorizon(now);
  const dueNow = dueNowFilter(horizon);
  const hourAgo = new Date(now.getTime() - 60 * 60_000);

  const [writtenThisHour, deferred, awaitingReview, demand, ready, pausedUntil] = await Promise.all([
    db.externalPublication.count({
      where: {
        AND: [plannedFilter, {
          OR: [
            { agentWrittenAt: { gte: hourAgo }, agentReviewedAt: null },
            { agentReviewedAt: { gte: hourAgo } },
          ],
        }],
      },
    }),
    db.externalPublication.count({
      where: { AND: [readyForWorkFilter, { scheduledFor: { gt: horizon } }] },
    }),
    db.externalPublication.count({
      where: { AND: [readyForWorkFilter, plannedFilter, awaitingReviewFilter] },
    }),
    db.externalPublication.count({ where: { AND: [readyForWorkFilter, dueNow, plannedFilter] } }),
    db.externalPublication.count({
      where: {
        AND: [
          plannedFilter,
          { status: { in: [...APPROVED_STATUSES] } },
          { scheduledFor: { gte: now, lte: horizon } },
        ],
      },
    }),
    marketingCapacityPausedUntil(now).catch(() => null),
  ]);

  // На паузе ёмкость не спрашивается: проход её тоже не спрашивает, и сводка
  // обязана показывать состояние линии, а не состояние провайдеров в отрыве
  // от неё.
  const capacity = pausedUntil
    ? { perHour: 0, materialsLeftToday: 0, canSeparateRoles: false }
    : await marketingHourlyCapacity(now).catch(() => ({
      perHour: 0,
      materialsLeftToday: 0,
      canSeparateRoles: false,
    }));

  const buffer = marketingBufferTarget(now);
  const tact = conveyorTact({
    demand,
    buffer,
    ready,
    hoursToHorizon: Math.ceil(MARKETING_GENERATION_LEAD_MS / 3_600_000),
    capacityPerHour: capacity.perHour,
    awaitingReview,
    maxAwaitingReview: MARKETING_MAX_AWAITING_REVIEW,
    writtenThisHour,
  });

  return {
    demand,
    buffer,
    ready,
    awaitingReview,
    maxAwaitingReview: MARKETING_MAX_AWAITING_REVIEW,
    writtenThisHour,
    deferred,
    perHour: tact.perHour,
    writerBudget: pausedUntil ? 0 : tact.writerBudget,
    capacityPerHour: capacity.perHour,
    materialsLeftToday: capacity.materialsLeftToday,
    canSeparateRoles: Boolean(capacity.canSeparateRoles),
    bottleneck: tact.bottleneck,
    pausedUntil,
    idleReason: idleReasonFor({
      pausedUntil,
      writerBudget: pausedUntil ? 0 : tact.writerBudget,
      bottleneck: tact.bottleneck,
      awaitingReview,
      maxAwaitingReview: MARKETING_MAX_AWAITING_REVIEW,
      canSeparateRoles: Boolean(capacity.canSeparateRoles),
    }),
  };
}
