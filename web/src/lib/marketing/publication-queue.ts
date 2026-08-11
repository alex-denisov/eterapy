/**
 * B589 фаза 1 · Пополнение очереди черновиков.
 *
 * Джоб `cron.marketing-generate` держит в реестре не больше N черновиков и
 * ничего не публикует. Наружу в этой фазе не уходит ничего вовсе — адаптеры
 * каналов и `cron.marketing-publish` это фаза 2.
 *
 * ⚠ ЗАНЯТЫЙ СЛОТ НЕ ЗАНИМАЕТСЯ ПОВТОРНО. Ключ слота уникален в базе, и это не
 * подстраховка «на всякий случай»: воркер тикает часто, а генератор daily —
 * без уникального ключа один и тот же пост уехал бы в очередь столько раз,
 * сколько тиков попало в сутки. Ошибка уникальности здесь — нормальная гонка,
 * а не сбой, поэтому она проглатывается, а не роняет джоб.
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { CONTENT_PLAN, contentPlanFor, nextPlanSlots, plannedAtFor, topicArticleSlug, withUnusedTopic } from "@/lib/marketing/content-plan";
import {
  DZEN_FEED_POST_PREFIX,
  DZEN_FEED_TARGET_ITEMS,
  dzenFeedPublishingEnabled,
} from "@/lib/marketing/dzen-feed";
import { generatePost } from "@/lib/marketing/post-generator";
import { demandFromCore, demandFromWordstat, mergeDemandSignals } from "@/lib/marketing/content-relevance";
import { marketingPlannerEnabled, planTopicsForSlots, type PlannedTopic } from "@/lib/marketing/planner";
import { scanTrends } from "@/lib/marketing/trend-scan";
import { isRecoverablePublicationError } from "@/lib/marketing/registry-recovery";
import { cachedWordstatWatchlist } from "@/lib/search-marketing-data";

/** Сколько черновиков держим наготове. Больше — не читает никто. */
export const DRAFT_QUEUE_TARGET = CONTENT_PLAN.length;

/**
 * B643 — сколько раз слот может быть занят заново.
 *
 * Мёртвый материал отпускает слот (см. `registry-recovery`), и слот пишется
 * ещё раз. Ключ строки уникален, слот уникален — значит новое поколение обязано
 * получить собственный ключ, и он же служит счётчиком: наличие `<slot>--r2`
 * означает «слот уже перевыпускали», отдельного поля не нужно.
 *
 * Предел в два поколения — про расход, а не про аккуратность: слот стоит
 * максимум 2 × (попытка + 2 восстановления) = 6 обращений к модели. Бесплатная
 * суточная ёмкость общая с ответами живым людям, и она важнее.
 */
export const MAX_SLOT_GENERATIONS = 2;
const SLOT_GENERATION_SUFFIX = "--r";

/** Ключ строки для N-го поколения слота. Первое поколение — сам слот. */
export function slotKeyForGeneration(slotKey: string, generation: number): string {
  return generation <= 1 ? slotKey : `${slotKey}${SLOT_GENERATION_SUFFIX}${generation}`;
}

/**
 * B620/B695 — статьи пополнения ленты Дзена, сожжённые дефектом.
 *
 * Порог площадки считается по материалам В ЛЕНТЕ, и ради него заведены статьи
 * с ключами `b620-rss-dzen-*` — вне двухнедельного плана. Замер прода
 * 2026-08-06: три из четырёх архивированы за один день с причиной «No free
 * provider returned valid structured output», то есть по отказу дороги,
 * который B695 признал НЕ виной материала. Написан не был ни один — гореть
 * было нечему.
 *
 * Возврат узкий намеренно. У плановых слотов свой механизм перевыпуска
 * (`slotKeyForGeneration`, B643), и второй здесь означал бы двойное
 * восстановление; массовое воскрешение всего архива вывалило бы в каналы
 * десятки строк разом.
 */
const DZEN_FEED_TOPUP_PREFIX = "b620-rss-dzen-";
/** Разводка возвращённых статей по времени: проход берёт их не все разом. */
const FEED_TOPUP_RESTORE_STEP_MS = 40 * 60_000;
const FEED_TOPUP_RESTORE_LEAD_MS = 30 * 60_000;

/**
 * Сколько раз одну статью можно поднять из архива.
 *
 * Без предела возврат замкнулся бы в круг: отказ → архив → возврат → тот же
 * отказ, и каждый оборот стоит полного цикла «автор + редактор» из общей
 * бесплатной ёмкости. Порог ленты кругу не помеха — он как раз и не берётся,
 * пока статьи не выходят.
 */
export const MAX_FEED_TOPUP_RESTORES = 2;
/** Счётчик живёт в `notes` строки: отдельная колонка ради четырёх статей лишняя. */
function feedTopUpRestoreCount(notes: string | null | undefined): number {
  if (!notes) return 0;
  try {
    const parsed = JSON.parse(notes) as { b695Restores?: unknown };
    return typeof parsed.b695Restores === "number" ? parsed.b695Restores : 0;
  } catch {
    return 0;
  }
}

function withFeedTopUpRestoreCount(notes: string | null | undefined, next: number): string {
  let parsed: Record<string, unknown> = {};
  if (notes) {
    try {
      const candidate = JSON.parse(notes) as unknown;
      if (candidate && typeof candidate === "object") parsed = candidate as Record<string, unknown>;
    } catch {
      // Notes не JSON — прежнее содержимое сохраняем отдельным полем, чтобы
      // счётчик не стёр редакционную заметку.
      parsed = { note: notes };
    }
  }
  return JSON.stringify({ ...parsed, b695Restores: next });
}

export async function restoreDzenFeedTopUp(
  input: { now?: Date } = {},
): Promise<number> {
  const now = input.now ?? new Date();
  // B698: возврат добивал ленту до нашей планки и обещал выключиться «сам, на
  // десятом материале». После перевода выпуска на браузер лента не растёт
  // вовсе — обещанное условие остановки стало недостижимым, и возврат
  // воскрешал бы архив бесконечно. Живёт ровно столько, сколько живёт выпуск
  // лентой.
  if (!await dzenFeedPublishingEnabled().catch(() => false)) return 0;
  const inFeed = await db.externalPublication.count({
    where: {
      platform: { in: ["dzen", "Dzen", "DZEN"] },
      status: "PUBLISHED",
      externalPostId: { startsWith: DZEN_FEED_POST_PREFIX },
    },
  }).catch(() => DZEN_FEED_TARGET_ITEMS);
  // Планка взята — возврат выключается сам, и реестр не читается вовсе.
  if (inFeed >= DZEN_FEED_TARGET_ITEMS) return 0;

  const archived = await db.externalPublication.findMany({
    where: { status: "ARCHIVED", key: { startsWith: DZEN_FEED_TOPUP_PREFIX } },
    select: { id: true, key: true, archiveReason: true, lastError: true, notes: true },
    orderBy: { key: "asc" },
  }).catch(() => []);

  let restored = 0;
  for (const row of archived) {
    const reason = `${row.archiveReason ?? ""} ${row.lastError ?? ""}`;
    // Решение редактора и safety-блок остаются архивом: материал признан
    // негодным по существу, и повтор дал бы тот же результат за ту же ёмкость.
    if (!isRecoverablePublicationError(reason)) continue;
    const restoresSoFar = feedTopUpRestoreCount(row.notes);
    if (restoresSoFar >= MAX_FEED_TOPUP_RESTORES) continue;
    await db.externalPublication.update({
      where: { id: row.id },
      data: {
        status: "DRAFT",
        autoPublish: false,
        agentReviewedAt: null,
        attemptCount: 0,
        recoveryCount: 0,
        archiveReason: null,
        notes: withFeedTopUpRestoreCount(row.notes, restoresSoFar + 1),
        scheduledFor: new Date(
          now.getTime() + FEED_TOPUP_RESTORE_LEAD_MS + restored * FEED_TOPUP_RESTORE_STEP_MS,
        ),
        lastError: `Возвращено в работу: архив был следствием отказа дороги, а не браком `
          + `материала (B695). Прежняя причина: ${row.archiveReason ?? row.lastError ?? "не записана"}`,
      },
    }).catch(() => undefined);
    restored += 1;
  }
  if (restored > 0) {
    log.info("marketing.dzen_feed_topup_restored", { restored, inFeed });
  }
  return restored;
}

export interface GenerateDraftsResult {
  created: number;
  skippedNoArticle: string[];
  /** B643: слоты, исчерпавшие право на перевыпуск. */
  exhaustedSlots: string[];
  /** B686: слоты, пропущенные из-за того, что все темы площадки уже заняты. */
  duplicateTopics: string[];
  /** B620/B695: статьи пополнения ленты, возвращённые из архива этим проходом. */
  feedTopUpRestored: number;
  /**
   * B702 фаза 5: темы, назначенные планировщиком из спроса/трендов, и сколько
   * из них пришло из каждого источника. Пишется в журнал прохода, чтобы
   * решение планировщика было видно и проверяемо задним числом.
   */
  plannedTopics: { total: number; byCore: number; byTrend: number };
  planExhausted: boolean;
}

export async function generateMarketingDrafts(input: {
  now?: Date;
  target?: number;
} = {}): Promise<GenerateDraftsResult> {
  const now = input.now ?? new Date();
  const activePlan = contentPlanFor(now);
  const target = input.target ?? activePlan.length;
  const firstVkSlot = activePlan.find((entry) => entry.channel === "vk");

  // B620/B695: статьи пополнения ленты, сожжённые отказом дороги, возвращаются
  // в работу до того, как проход начнёт считать свободные слоты.
  const feedTopUpRestored = await restoreDzenFeedTopUp({ now }).catch(() => 0);

  // INC-094: the launch post was entered before the autonomous editor existed
  // and remained forever in the non-executable PLANNED state. Put it through
  // the same writer → independent editor → scheduler route as every new item.
  if (firstVkSlot) {
    await db.externalPublication.updateMany({
      where: { key: "vk-community-first-post-2026-07-25", status: "PLANNED" },
      data: {
        status: "DRAFT",
        scheduledFor: new Date(plannedAtFor(firstVkSlot).getTime() - 60 * 60_000),
        autoPublish: false,
        agentReviewedAt: null,
        lastError: null,
        notes: JSON.stringify({
          format: "первый пост сообщества",
          editorialAngle: "полезный самостоятельный ответ: факты отдельно от догадок, затем один спокойный CTA",
          timezone: "Europe/Moscow",
          reconciledFrom: "INC-094",
        }),
      },
    });
  }

  const existing = await db.externalPublication.findMany({
    where: { planSlot: { not: null } },
    select: { planSlot: true },
  });

  const currentKeys = new Set(activePlan.map((slot) => slot.key));
  const taken = existing
    .map((row) => row.planSlot)
    .filter((slot): slot is string => typeof slot === "string" && currentKeys.has(slot));
  await db.externalPublication.updateMany({
    where: {
      AND: [
        { planSlot: { not: null } },
        { planSlot: { startsWith: "b589-" } },
        { status: { in: ["DRAFT", "REVIEW", "SCHEDULED", "FAILED"] } },
      ],
    },
    data: {
      status: "ARCHIVED",
      autoPublish: false,
      lastError: "SUPERSEDED_BY_B610_TWO_WEEK_PLAN",
    },
  });
  // Comments discovered by the SMM agent and ad-hoc drafts must not crowd
  // scheduled content out of the plan. The target applies only to plan slots.
  const shortfall = Math.max(0, target - taken.length);
  const slots = nextPlanSlots(taken, shortfall, activePlan);

  // B643: слот свободен, но его прошлые поколения остались в реестре со своими
  // ключами. Один запрос на весь проход вместо запроса на слот.
  const spentKeys = new Set(
    slots.length === 0
      ? []
      : (await db.externalPublication.findMany({
        where: {
          key: {
            in: slots.flatMap((slot) => Array.from(
              { length: MAX_SLOT_GENERATIONS },
              (_, index) => slotKeyForGeneration(slot.key, index + 1),
            )),
          },
        },
        select: { key: true },
      })).map((row) => row.key),
  );

  const skippedNoArticle: string[] = [];
  const exhaustedSlots: string[] = [];
  const duplicateTopics: string[] = [];
  let created = 0;
  let plannedByCore = 0;
  let plannedByTrend = 0;

  /**
   * B686 — площадки, где две статьи на одну тему это дубль, а не два взгляда.
   *
   * У Дзена материал длинный и живёт в ленте: повтор темы читается как повтор
   * статьи и портит канал (владелец 2026-08-06). У Telegram и Threads формат
   * короткий, в плане на две недели 42 слота на 16 тем, и возврат к теме другим
   * форматом — норма; запрет уникальности выкосил бы там две трети плана.
   */
  const UNIQUE_TOPIC_PLATFORMS = new Set(["dzen"]);

  // Занятые темы считаются ОДИН раз на проход и пополняются по мере создания:
  // иначе два слота одного окна выберут одну и ту же «первую свободную».
  const usedTopicsByPlatform = new Map<string, Set<string>>();
  for (const platform of UNIQUE_TOPIC_PLATFORMS) {
    const rows = await db.externalPublication.findMany({
      where: {
        platform,
        // Архив — это отбракованное; его темы снова свободны
        // (`feedback_reschedule_never_archive_media` про обратное — про то, что
        // хороший материал в архив не отправляют вовсе).
        status: { not: "ARCHIVED" },
        planSlot: { not: null },
      },
      select: { cluster: true, targetQuery: true },
    }).catch(() => []);
    usedTopicsByPlatform.set(
      platform,
      new Set(rows.map(topicArticleSlug).filter((value): value is string => Boolean(value))),
    );
  }

  // B702 фаза 4 — тема свободного слота решается планировщиком спроса/трендов,
  // а не ротацией константы `TOPICS`. Снимок спроса (ядро + кэшированный wordstat
  // за 24 часа) и живые тренды discovery собираются ДО цикла, чтобы планировщик
  // видел все свободные слоты прохода и не раздал одну статью двум из них.
  //
  // Гейт `marketingPlannerEnabled` — env-флаг: включение дёшево и не тратит
  // суточную ёмкость (LLM не зовётся вовсе). Оба источника могут молчать —
  // тогда план остаётся на остовных темах `TOPICS` (фолбэк ниже), канал без
  // материала планировщик не оставляет.
  const plannedTopics = new Map<string, PlannedTopic>();
  if (marketingPlannerEnabled() && slots.length > 0) {
    const wordstat = await cachedWordstatWatchlist().catch(() => []);
    const signals = mergeDemandSignals([demandFromCore(), demandFromWordstat(wordstat)]);
    const trends = await scanTrends().catch(() => []);
    for (const [key, topic] of planTopicsForSlots({ slots, signals, trends, usedByPlatform: usedTopicsByPlatform })) {
      plannedTopics.set(key, topic);
    }
  }

  for (const rawSlot of slots) {
    const used = usedTopicsByPlatform.get(rawSlot.channel);
    // Тема планировщика сильнее остовной, но не может занять уже занятую на
    // площадке статью — планировщик её и так исключил, проверка дешёвая подушка.
    const planned = plannedTopics.get(rawSlot.key);
    const slot = planned && !used?.has(planned.articleSlug)
      ? { ...rawSlot, cluster: planned.cluster, articleSlug: planned.articleSlug, targetQuery: planned.targetQuery }
      : used
        ? withUnusedTopic(rawSlot, used)
        : rawSlot;
    if (!slot) {
      // Свободных тем не осталось. Пропуск виден снаружи, дубль — нет.
      duplicateTopics.push(rawSlot.key);
      log.warn("marketing.plan_slot_topic_exhausted", { slot: rawSlot.key, platform: rawSlot.channel });
      continue;
    }
    if (planned && planned.articleSlug === slot.articleSlug) {
      if (planned.origin === "trend") plannedByTrend += 1;
      else plannedByCore += 1;
    }
    used?.add(slot.articleSlug);
    const generation = Array.from({ length: MAX_SLOT_GENERATIONS }, (_, index) => index + 1)
      .find((candidate) => !spentKeys.has(slotKeyForGeneration(slot.key, candidate)));
    if (!generation) {
      // Слот выработал право на перевыпуск. Молчать нельзя: снаружи это выглядит
      // как «план короче, чем обещано», и без строки в журнале причину не найти.
      exhaustedSlots.push(slot.key);
      log.warn("marketing.plan_slot_exhausted", { slot: slot.key, generations: MAX_SLOT_GENERATIONS });
      continue;
    }
    const key = slotKeyForGeneration(slot.key, generation);
    const post = generatePost(slot);
    if (!post) {
      // Слот указывает на несуществующую статью. Это дефект плана, и заменять
      // её «похожей» нельзя: пост уведёт читателя в никуда.
      skippedNoArticle.push(slot.key);
      log.error("marketing.plan_slot_without_article", { slot: slot.key, article: slot.articleSlug });
      continue;
    }

    try {
      await db.externalPublication.create({
        data: {
          key,
          planSlot: slot.key,
          platform: slot.channel,
          title: post.title,
          contentType: "POST",
          status: "DRAFT",
          body: post.body,
          destinationUrl: post.destinationUrl,
          utmSource: post.utm.source,
          utmMedium: post.utm.medium,
          utmCampaign: post.utm.campaign,
          utmContent: post.utm.content,
          targetQuery: slot.targetQuery,
          cluster: slot.cluster,
          notes: JSON.stringify({
            format: slot.format,
            editorialAngle: slot.editorialAngle,
            timezone: "Europe/Moscow",
            // B700 фаза 4: класс материала и ширина ЕГО окна. Держатся в
            // строке, а не вычисляются при выпуске: слот мог быть создан
            // прежней таблицей окон, и менять правила выпуска задним числом
            // у материала, уже прошедшего редактора, нельзя.
            contentClass: slot.contentClass,
            daypart: slot.daypart,
            toleranceMs: slot.toleranceMs,
            // B702 фаза 4: откуда тема — спрос/ядро или живой тренд. Пишется в
            // строку для сводки конвейера и журнала выпуска, чтобы решение
            // планировщика можно было проверить задним числом.
            topicOrigin: planned?.origin,
            topicRationale: planned?.rationale,
          }),
          source: "CRON_B589",
          autoPublish: false,
          scheduledFor: plannedAtFor(slot),
          createdAt: now,
        },
      });
      created += 1;
    } catch (error) {
      // Гонка на уникальном ключе слота — ожидаемое состояние, а не отказ.
      log.warn("marketing.draft_slot_taken", {
        slot: slot.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    created,
    skippedNoArticle,
    exhaustedSlots,
    // B686: пропуск из-за занятой темы — отдельное число. Свести его с
    // `exhaustedSlots` значило бы спрятать «в канале кончились темы» внутри
    // «слот исчерпал перевыпуски»: причины разные и чинятся по-разному.
    duplicateTopics,
    feedTopUpRestored,
    // B702 фаза 5: счётчики планировщика в сводке прохода — журнал
    // (`cron-marketing-generate-completed`) и панель видят, сколько тем
    // пришло из спроса, а сколько из живых трендов. Пока планировщик
    // выключен — оба нули, поведение прежнего конвейера не меняется.
    plannedTopics: { total: plannedByCore + plannedByTrend, byCore: plannedByCore, byTrend: plannedByTrend },
    planExhausted: taken.length + created >= activePlan.length,
  };
}

/**
 * INC-094 taught us that a row can sit in a state nothing acts on — created by
 * hand as `PLANNED`, never picked up by the generator, never published, and
 * invisible as a problem because no step ever failed. The registry now audits
 * itself: any row that has been parked in a non-terminal state past a
 * reasonable window raises a signal in the superadmin cockpit.
 */
const STALLED_STATE_WINDOW_MS = 48 * 60 * 60_000;

export interface StalledPublicationsResult {
  stalled: Array<{ id: string; key: string; status: string; ageHours: number }>;
}

export async function auditStalledPublications(
  input: { now?: Date } = {},
): Promise<StalledPublicationsResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - STALLED_STATE_WINDOW_MS);
  const rows = await db.externalPublication.findMany({
    where: {
      // PLANNED has no executor; PUBLISHING means a dispatch that never
      // finished. Both are silent stalls rather than reported failures.
      status: { in: ["PLANNED", "PUBLISHING"] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, key: true, status: true, platform: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  const stalled = rows.map((row) => ({
    id: row.id,
    key: row.key,
    status: row.status,
    ageHours: Math.round((now.getTime() - row.updatedAt.getTime()) / 3_600_000),
  }));

  const { resolveMarketingSignal, upsertMarketingSignal } = await import("@/lib/marketing/agent");
  if (stalled.length === 0) {
    await resolveMarketingSignal("registry:stalled").catch(() => undefined);
    return { stalled };
  }
  await upsertMarketingSignal({
    key: "registry:stalled",
    kind: "REGISTRY",
    severity: "WARNING",
    title: `Материалы без исполняемого статуса: ${stalled.length}`,
    summary: stalled
      .slice(0, 5)
      .map((row) => `${row.key} — ${row.status}, ${row.ageHours} ч`)
      .join("; "),
    evidence: { rows: stalled },
  }).catch(() => undefined);
  return { stalled };
}
