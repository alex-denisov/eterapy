/**
 * B626 — восстановление реестра и гигиена сигналов.
 *
 * ЧТО БЫЛО ВИДНО ВЛАДЕЛЬЦУ. Кокпит показывал десятки строк «ошибка» и «архив»
 * без объяснения, а панель «Автоматические тикеты и инциденты» копила по
 * инциденту на каждую неудавшуюся публикацию и не убирала их даже тогда, когда
 * причина давно прошла. Обе картины — не отчёт о состоянии, а осадок истории.
 *
 * ПЯТЬ ПРАВИЛ, КОТОРЫЕ ЗДЕСЬ ИСПОЛНЯЮТСЯ.
 *
 * 1. Технический отказ — это не приговор материалу. Строка, чей слот ещё не
 *    наступил, возвращается в работу с явным счётчиком попыток. Возвращать
 *    строку, чьё время уже прошло, нельзя: она вышла бы «задним числом», а
 *    именно от этого страховались при восстановлении очереди после B623.
 * 2. Причина архивации хранится отдельным полем и на человеческом языке.
 *    `lastError` отвечает на вопрос «на чём упала последняя попытка», а не
 *    «почему строки больше нет в плане» — это разные вопросы.
 * 3. Сигнал живёт, пока живёт его причина. Инцидент по конкретной публикации
 *    снимается, как только публикация вышла из отказа; сигнал, который перестал
 *    повторяться, закрывается сам по давности. Иначе панель показывает не
 *    состояние, а архив.
 * 4. B636: отказ КАНАЛА не отменяет материал вовсе. Правило 1 говорит про
 *    дефект материала; когда упала дорога наружу, материал ни в чём не виноват
 *    и остаётся в очереди, сколько бы ни стоял канал. Пауза канала живёт в
 *    `publish-hold.ts`, здесь — только починка строк, упавших по старому
 *    правилу.
 * 5. B645: невыпущенный материал ПЕРЕНОСИТСЯ, а не отменяется. Архив — приговор
 *    материалу («редактор не утвердил», safety-блок), а не способ управлять
 *    расписанием. Утверждённый текст переезжает в следующий слот своего канала;
 *    архив остаётся там, где переносить нечего — у строки нет ни тела, ни
 *    отметки редактора.
 */

import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";
import { isChannelLevelPublicationError, listChannelHolds } from "@/lib/marketing/publish-hold";
import { MAX_SLOT_DEFERRALS, deferPublicationToNextSlot } from "@/lib/marketing/slot-window";

/** Сколько раз строку возвращают в работу, прежде чем признать её неисправимой. */
export const MAX_RECOVERY_ATTEMPTS = 2;

/**
 * Насколько раньше слота материал должен быть готов, чтобы возврат имел смысл.
 * Меньше часа до выхода — восстанавливать нечего: writer не успеет.
 */
export const RECOVERY_MIN_LEAD_MS = 60 * 60_000;

/** Сигнал, который не повторялся столько времени, закрывается по давности. */
export const SIGNAL_STALE_MS = 72 * 60 * 60_000;

/**
 * Отказы, которые повторная генерация может исправить: у материала не тот
 * объём, не та структура ответа модели, коннектор ответил ошибкой сети. Всё это
 * зависит от попытки, а не от самого материала.
 *
 * Сюда НЕ входят решения редактора («не утвердил в три раунда») и safety-блок:
 * они означают, что материал негоден, и повтор дал бы тот же результат за счёт
 * той же ёмкости.
 */
const RECOVERABLE_ERROR_MARKERS = [
  "exceeds the",
  // B644: обрыв по нашему лимиту вывода. Повтор осмыслен ровно потому, что
  // бюджет теперь растёт внутри самой попытки (`completeWithValidStructure`);
  // при прежнем фиксированном лимите это был бы третий одинаковый отказ.
  "обрезан по лимиту вывода",
  "returned invalid or incomplete structured output",
  "no free provider returned valid structured output",
  "omitted the required media brief",
  "fetch failed",
  "timeout",
  "timed out",
  "econnreset",
  "socket hang up",
  "502",
  "503",
  "504",
];

export function isRecoverablePublicationError(error: string | null | undefined): boolean {
  if (!error) return false;
  const message = error.toLowerCase();
  return RECOVERABLE_ERROR_MARKERS.some((marker) => message.includes(marker));
}

export interface RegistryRecoveryResult {
  requeued: number;
  archived: number;
  /** B643: слоты, освобождённые из-под материала, который уже не выйдет. */
  slotsReleased: number;
  /** B636: строки, возвращённые в очередь после отказа канала. */
  returnedToQueue: number;
  /** B645: утверждённые материалы, переехавшие в следующий слот вместо архива. */
  deferredToNextSlot: number;
  /** B645: материалы, которым переносить некуда — они ждут выпуска как есть. */
  stuckInQueue: number;
  blockedPlatforms: string[];
  /** B636: каналы, стоящие на паузе прямо сейчас. */
  heldPlatforms: string[];
}

/**
 * Один проход восстановления: вернуть исправимое, закрыть просроченное,
 * сказать вслух про заблокированные площадки.
 */
export async function recoverFailedPublications(
  input: { now?: Date } = {},
): Promise<RegistryRecoveryResult> {
  const now = input.now ?? new Date();
  const failed = await db.externalPublication.findMany({
    where: { status: "FAILED" },
    select: {
      id: true,
      key: true,
      platform: true,
      scheduledFor: true,
      lastError: true,
      recoveryCount: true,
      attemptCount: true,
      planSlot: true,
      // B645: перенос вместо архива возможен только там, где есть что
      // переносить — утверждённый редактором текст.
      body: true,
      notes: true,
      agentReviewedAt: true,
      deferralCount: true,
    },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });

  let requeued = 0;
  let archived = 0;
  let returnedToQueue = 0;
  let slotsReleased = 0;
  let deferredToNextSlot = 0;
  let stuckInQueue = 0;
  for (const row of failed) {
    // B636 — отказ КАНАЛА не отменяет материал никогда.
    //
    // Начиная с B636 выпуск сам возвращает такую строку в очередь, но на проде
    // уже лежат строки, упавшие по старому правилу, и часть из них успела
    // уехать в архив по прошедшему слоту. Сверка чинит их: материал возвращается
    // в `SCHEDULED` со своим временем и выйдет, как только канал снова
    // ответит. Да, он выйдет позже своего слота — это осознанный размен:
    // владелец 2026-07-31 прямо потребовал не отменять публикации из-за отказа
    // канала, а «поздно» здесь честнее, чем «никогда».
    // `attemptCount > 0` — признак того, что строка ДОШЛА до выпуска. Без него
    // сюда попал бы отказ генерации с той же сетевой формулировкой («fetch
    // failed» у провайдера модели), и неутверждённый черновик уехал бы наружу
    // мимо редактора.
    if (row.attemptCount > 0 && isChannelLevelPublicationError(row.lastError)) {
      await db.externalPublication.update({
        where: { id: row.id },
        data: {
          status: "SCHEDULED",
          lastError: `Канал недоступен, публикация отложена: ${row.lastError ?? "причина не записана"}`,
        },
      });
      await resolveMarketingSignal(`agent-draft:${row.id}`).catch(() => undefined);
      returnedToQueue += 1;
      continue;
    }

    const slotAhead = Boolean(
      row.scheduledFor && row.scheduledFor.getTime() - now.getTime() >= RECOVERY_MIN_LEAD_MS,
    );
    const technical = isRecoverablePublicationError(row.lastError);
    const repeatable = technical && row.recoveryCount < MAX_RECOVERY_ATTEMPTS;

    // B645 — УТВЕРЖДЁННЫЙ ТЕКСТ НЕ АРХИВИРУЕТСЯ И НЕ ПЕРЕПИСЫВАЕТСЯ.
    //
    // Требование владельца 2026-08-03: «если статья хорошая, нужно решедулить,
    // а не отменять её вовсе». Материал, прошедший редактора и лежащий в строке
    // целиком, не испортился оттого, что канал молчал два часа или что его слот
    // прошёл. Он переезжает в следующий слот того же канала — и проверка стоит
    // ПЕРЕД возвратом в работу: перегенерировать утверждённый текст значило бы
    // потратить ёмкость на замену того, что уже готово.
    //
    // Условие «утверждён» здесь не формальность: строка без тела и без отметки
    // редактора — несостоявшаяся генерация, переносить в ней нечего, и она
    // идёт прежними дорогами ниже.
    const approved = Boolean(row.agentReviewedAt && row.body?.trim());
    if (approved && technical) {
      const deferral = await deferPublicationToNextSlot({
        publication: row,
        now,
        reason: slotAhead
          ? "Материал не удалось выпустить в свой слот."
          : "Слот прошёл, пока материал был в отказе.",
        nextStatus: "SCHEDULED",
      }).catch(() => ({ deferred: false } as const));
      if (deferral.deferred) {
        await resolveMarketingSignal(`agent-draft:${row.id}`).catch(() => undefined);
        deferredToNextSlot += 1;
        continue;
      }
      // Переносить некуда или право исчерпано. Материал всё равно не
      // выбрасывается: он остаётся утверждённым и выйдет поздно, как только
      // канал ответит. Владелец узнаёт об этом сигналом, а не по пустой ленте.
      await db.externalPublication.update({
        where: { id: row.id },
        data: {
          status: "SCHEDULED",
          lastError: `Материал не вышел в свой слот и остаётся в очереди: ${row.lastError ?? "причина не записана"}`,
        },
      });
      await upsertMarketingSignal({
        key: `plan-deferral:${row.id}`,
        kind: "REGISTRY",
        severity: "WARNING",
        title: `Материал «${row.key}» не выходит: переносить больше некуда`,
        summary: `Переносов ${row.deferralCount} из ${MAX_SLOT_DEFERRALS}. `
          + "Материал утверждён и остаётся в очереди — он выйдет, как только канал ответит, "
          + `но своего времени уже не получит. Последняя причина: ${row.lastError ?? "не записана"}`,
        evidence: { publicationId: row.id, platform: row.platform, deferralCount: row.deferralCount },
      }).catch(() => undefined);
      stuckInQueue += 1;
      continue;
    }

    if (slotAhead && repeatable) {
      await db.externalPublication.update({
        where: { id: row.id },
        data: {
          status: "DRAFT",
          agentReviewedAt: null,
          attemptCount: 0,
          recoveryCount: { increment: 1 },
          // Причина не стирается: следующий проход должен знать, на чём было
          // споткнулись, а кокпит — показать это в колонке контроля.
          lastError: `Возвращено в работу после технического отказа: ${row.lastError ?? "причина не записана"}`,
        },
      });
      // Инцидент по этой строке больше не отражает состояние.
      await resolveMarketingSignal(`agent-draft:${row.id}`).catch(() => undefined);
      requeued += 1;
      continue;
    }

    // B643 — СГОРЕВШИЙ СЛОТ.
    //
    // Бюджет восстановления исчерпан, а слот ещё впереди. Раньше строка просто
    // оставалась `FAILED` и ждала, когда её дата пройдёт: `planSlot` уникален,
    // так что слот всё это время не мог принять другой материал и отдавал ноль.
    // Замер прода 2026-08-03 показал цену правила — двенадцать из тринадцати
    // будущих слотов Дзена были заняты такими строками, и лента B620 не могла
    // дойти до десяти материалов ни при каком исправном генераторе.
    //
    // Ждать здесь нечего: повторов больше не будет. Строка архивируется сразу и
    // отпускает слот под новое поколение (`slotKeyForGeneration` в
    // `publication-queue`). Причина остаётся в `archiveReason` — из кокпита
    // строка не исчезает, исчезает только её право на слот.
    //
    // ⚠ Отпускает слот ТОЛЬКО технический отказ. Решение редактора и
    // safety-блок сюда не попадают (`isRecoverablePublicationError` = false):
    // там материал признан негодным по существу, и перевыпуск слота был бы
    // обходом редактора за счёт той же бесплатной ёмкости.
    if (slotAhead && technical && row.planSlot) {
      await db.externalPublication.update({
        where: { id: row.id },
        data: {
          status: "ARCHIVED",
          autoPublish: false,
          planSlot: null,
          archiveReason: `Материал не удалось выпустить за ${MAX_RECOVERY_ATTEMPTS} попытки, `
            + `слот освобождён под новый материал: ${row.lastError ?? "причина не записана"}`,
        },
      });
      await resolveMarketingSignal(`agent-draft:${row.id}`).catch(() => undefined);
      slotsReleased += 1;
      continue;
    }

    // Слот прошёл — материал уже не выйдет вовремя. Возвращать его значило бы
    // опубликовать вчерашнее сегодня; архив с причиной честнее.
    if (row.scheduledFor && row.scheduledFor.getTime() < now.getTime()) {
      await db.externalPublication.update({
        where: { id: row.id },
        data: {
          status: "ARCHIVED",
          autoPublish: false,
          archiveReason: repeatable
            ? `Срок слота прошёл, пока материал был в отказе: ${row.lastError ?? "причина не записана"}`
            : `Материал не прошёл выпуск и не подлежит повтору: ${row.lastError ?? "причина не записана"}`,
        },
      });
      await resolveMarketingSignal(`agent-draft:${row.id}`).catch(() => undefined);
      archived += 1;
    }
  }

  const heldPlatforms = (await listChannelHolds().catch(() => []))
    .map((hold) => hold.platform);
  const blockedPlatforms = await reportBlockedScheduledPlatforms(now, new Set(heldPlatforms));

  log.info("marketing.registry_recovery", {
    requeued,
    archived,
    slotsReleased,
    returnedToQueue,
    deferredToNextSlot,
    stuckInQueue,
    blockedPlatforms,
    heldPlatforms,
  });
  return {
    requeued,
    archived,
    slotsReleased,
    returnedToQueue,
    deferredToNextSlot,
    stuckInQueue,
    blockedPlatforms,
    heldPlatforms,
  };
}

/**
 * Просроченная строка со статусом SCHEDULED — самый тихий из отказов: выпуск
 * пропускает её без ошибки, потому что коннектор площадки выключен. Снаружи это
 * выглядит как «публикации не появляются», а в реестре всё «утверждено».
 * Поэтому состояние произносится вслух — одним сигналом на площадку.
 */
async function reportBlockedScheduledPlatforms(
  now: Date,
  heldPlatforms: Set<string>,
): Promise<string[]> {
  const overdue = await db.externalPublication.groupBy({
    by: ["platform"],
    where: { status: "SCHEDULED", scheduledFor: { lt: new Date(now.getTime() - 30 * 60_000) } },
    _count: { _all: true },
  }).catch(() => [] as Array<{ platform: string; _count: { _all: number } }>);

  const { marketingPlatformEnabled } = await import("@/lib/marketing/platform-settings");
  const connectorNames = {
    vk: "VK",
    reddit: "Reddit",
    threads: "Threads",
    instagram: "Instagram",
    telegram: "Telegram",
    dzen: "Dzen",
  } as const;

  const blocked: string[] = [];
  for (const row of overdue) {
    const connector = connectorNames[row.platform.toLowerCase() as keyof typeof connectorNames];
    if (!connector) continue;
    // B636: канал на паузе уже объяснён своим сигналом. Второй сигнал про тот
    // же канал заставил бы искать вторую причину там, где она одна.
    if (heldPlatforms.has(row.platform.toLowerCase())) {
      await resolveMarketingSignal(`publish-blocked:${row.platform.toLowerCase()}`).catch(() => undefined);
      continue;
    }
    const enabled = await marketingPlatformEnabled(connector).catch(() => false);
    const key = `publish-blocked:${row.platform.toLowerCase()}`;
    if (enabled) {
      await resolveMarketingSignal(key).catch(() => undefined);
      continue;
    }
    blocked.push(row.platform.toLowerCase());
    await upsertMarketingSignal({
      key,
      kind: "REGISTRY",
      severity: "WARNING",
      title: `${connector}: утверждённые материалы не выходят — коннектор выключен`,
      summary: `Просроченных утверждённых материалов: ${row._count._all}. Выпуск пропускает их без ошибки, `
        + "потому что настройки площадки не сохранены или выключены. Строки остаются на месте "
        + "и выйдут на первом тике после включения — выкатка не нужна.",
      evidence: { platform: row.platform, overdue: row._count._all },
    }).catch(() => undefined);
  }
  return blocked;
}

export interface SignalReconcileResult {
  resolvedByState: number;
  resolvedByAge: number;
}

/**
 * Сигнал должен исчезать сам вместе со своей причиной.
 *
 * Два случая, из-за которых панель заливало: инцидент по публикации, которая
 * давно вышла из отказа, и сигнал, который просто перестал повторяться. Первый
 * снимается по факту состояния, второй — по давности последнего появления.
 */
export async function reconcileMarketingSignals(
  input: { now?: Date } = {},
): Promise<SignalReconcileResult> {
  const now = input.now ?? new Date();
  const open = await db.marketingAutomationSignal.findMany({
    where: { status: "OPEN" },
    select: { id: true, key: true, lastSeenAt: true },
    take: 500,
  });

  const draftSignals = open.filter((row) => row.key.startsWith("agent-draft:"));
  const publicationIds = draftSignals.map((row) => row.key.slice("agent-draft:".length));
  const stillFailing = publicationIds.length > 0
    ? await db.externalPublication.findMany({
      where: { id: { in: publicationIds }, status: "FAILED" },
      select: { id: true },
    })
    : [];
  const failingSet = new Set(stillFailing.map((row) => row.id));
  const staleByState = draftSignals
    .filter((row) => !failingSet.has(row.key.slice("agent-draft:".length)))
    .map((row) => row.id);

  const cutoff = new Date(now.getTime() - SIGNAL_STALE_MS);
  const staleByAge = open
    .filter((row) => !staleByState.includes(row.id) && row.lastSeenAt < cutoff)
    .map((row) => row.id);

  const resolve = (ids: string[]): Prisma.PrismaPromise<{ count: number }> =>
    db.marketingAutomationSignal.updateMany({
      where: { id: { in: ids }, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: now },
    });

  const resolvedByState = staleByState.length > 0 ? (await resolve(staleByState)).count : 0;
  const resolvedByAge = staleByAge.length > 0 ? (await resolve(staleByAge)).count : 0;

  log.info("marketing.signals_reconciled", { resolvedByState, resolvedByAge });
  return { resolvedByState, resolvedByAge };
}
