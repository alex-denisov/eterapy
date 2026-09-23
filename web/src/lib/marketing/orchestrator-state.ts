/**
 * B740 — СОСТОЯНИЕ КОНТУРА ОДНИМ СНИМКОМ.
 *
 * Оркестратор судит по числам, а не по ощущению, поэтому сбор состояния вынесен
 * из него отдельно и целиком: диагноз — чистая функция от этого снимка, и
 * проверяется прогоном, а не живой базой. Ровно то же решение, что у
 * `conveyor-snapshot.ts`, и по той же причине.
 */

import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { log, serializeError } from "@/lib/logger";
import { conveyorSnapshot, type ConveyorSnapshot } from "@/lib/marketing/conveyor-snapshot";
import { MARKETING_ACTIVE_PROVIDERS } from "@/lib/marketing/model-pool";
import { humanCause } from "@/lib/marketing/shortfall-notification";
import { SEO_PAGE_STATUS } from "@/lib/seo/library-store";
import { moscowDayBounds, seoPagesPerDay } from "@/lib/seo/page-agent";
import { readSearchSources, type SearchSourcesState } from "@/lib/marketing/orchestrator-search-sources";
import { thinCards } from "@/lib/seo/backfill";
import { dzenBrowserHealth, type BrowserSessionHealth } from "@/lib/marketing/browser-publisher";
import { VERTEX_CREDENTIAL_LABEL } from "@/lib/ai-gateway/free-tier-bootstrap";
import { collectTrend, type TrendState } from "@/lib/marketing/orchestrator-trend";
import { contentPlanFor } from "@/lib/marketing/content-plan";
import {
  BACKLINK_STATUS_KEY,
  backlinkTargetsWithStatus,
  parseBacklinkStatus,
  type BacklinkTargetState,
} from "@/lib/seo/backlink-targets";

export interface ProviderState {
  provider: string;
  enabled: boolean;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
}

export interface PlatformOutcome {
  platform: string;
  published: number;
  stalled: number;
  topReason: string | null;
}

export interface SignalState {
  key: string;
  severity: string;
  title: string;
  summary: string;
  firstSeenAt: Date;
}

export interface SeoState {
  publishedToday: number;
  publishedWeek: number;
  dailyCap: number;
  queueNew: number;
  queueRejected: number;
  /** Сколько опубликованных страниц НИ РАЗУ не отдавали в переобход. */
  neverSubmitted: number;
  lastPublishedAt: Date | null;
}

/**
 * B747 — выпуск площадки за две недели.
 *
 * Находки SMM раньше строились только из ВСТАВШИХ за сутки материалов. Когда
 * материалов нет вовсе, нет и вставших — и неделя без единого поста выглядела
 * для диагноза как «всё спокойно». Тишина видна только от выпуска.
 */
export interface FeedOutput {
  platform: string;
  lastPublishedAt: Date | null;
  /** Выпущено за 14 суток — из него диагноз выводит обычный шаг ленты. */
  publishedFortnight: number;
}

/** Причина, по которой материалы вставали, и сколько раз за сутки. */
export interface CauseTally {
  reason: string;
  count: number;
}

export interface SearchState {
  impressions: number | null;
  clicks: number | null;
  averagePosition: number | null;
  searchablePages: number | null;
  previousImpressions: number | null;
}

export interface OrchestratorState {
  now: Date;
  conveyor: ConveyorSnapshot;
  providers: ProviderState[];
  platforms: PlatformOutcome[];
  signals: SignalState[];
  seo: SeoState;
  search: SearchState;
  /**
   * Причины отказов за сутки, сведённые по ВСЕМУ контуру.
   *
   * Отдельно от разбивки по площадкам намеренно: одна и та же причина,
   * размазанная по шести площадкам, в каждой выглядит единичной, а в сумме
   * это системный дефект промта. Именно такую и надо чинить правилом, а не
   * перезапуском материалов.
   */
  causes: CauseTally[];
  /** Материалы, вставшие насмерть за сутки — кандидаты на возврат в работу. */
  stalledIds: string[];
  /** B747 — выпуск каждой площадки действующего плана. */
  feeds: FeedOutput[];
  /**
   * B747 — пустые архивные строки, которые всё ещё держат будущий слот плана.
   * Планировщик считает такой слот занятым, и он не заполнится никогда.
   */
  lockedSlotIds: string[];
  /**
   * B741 — живые ответы Вебмастера и Search Console.
   *
   * Отдельно от `search`, который читает суточный срез: срез отвечает на
   * вопрос «как менялось», источники — на вопрос «как есть прямо сейчас и
   * отвечают ли они вообще». Молчащий источник виден только здесь.
   */
  sources: SearchSourcesState;
  /** Сколько карточек корпуса всё ещё не проходят гейт глубины. */
  thinCards: number;
  /**
   * B742 — состояние браузерной сессии Дзена.
   *
   * ⚠ ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ВЕЛИЧИНА, А НЕ «ПЛОЩАДКА НЕ ВЫПУСКАЕТ». У Дзена нет
   * API, выпуск идёт живой браузерной сессией, и она стареет: профиль в томе
   * сервиса, вход владельца — раз в несколько недель через VNC. Пока сессия
   * мертва, материалы Дзена копятся в SCHEDULED и не жгут слот (B695) — то
   * есть снаружи это выглядит как тишина, а не как поломка. Владелец
   * 2026-09-12: «на Дзене агент должен был сам публиковать материалы, если
   * этого нет, значит флоу сломан». Сломан не флоу — просрочен вход, и это
   * ровно тот случай, когда молчание дороже сообщения.
   */
  dzen: BrowserSessionHealth | null;
  /**
   * B742 — применённые правки прошлых проходов.
   *
   * Оркестратор обязан оценивать собственные действия, а не только состояние
   * контура: правка, которая не помогла, должна быть названа, иначе она будет
   * предлагаться снова каждые сутки.
   */
  /**
   * B742 — поднят ли маршрут Vertex.
   *
   * ⚠ ЭТО ВОПРОС ПРО ДЕНЬГИ, А НЕ ПРО ТЕХНИКУ. Бонусные $300 пробного периода
   * Google Cloud на Gemini API в AI Studio не распространяются и покрывают
   * Vertex, где живут те же модели. Пока маршрут не поднят, контур платит
   * картой владельца там, где мог бы тратить бонус, — и об этом никто не
   * узнает, потому что снаружи всё работает.
   */
  vertexConfigured: boolean;
  /**
   * B746 — ряд по дням, дельты недели к неделе, разнообразие лент и
   * черновики-дубли. Без этого оркестратор не видел ни ленты из десяти
   * одинаковых постов, ни того, помогли ли его правки.
   */
  trend: TrendState;
  /** B746 — реестр внешних площадок с состоянием шага человека из базы. */
  backlinks: BacklinkTargetState[];
  recentDirectives: Array<{
    key: string;
    action: string;
    problem: string;
    appliedAt: Date | null;
    status: string;
  }>;
}

/** Самая частая причина в наборе. `null`, если причин нет вовсе. */
function topReasonOf(reasons: string[]): string | null {
  if (reasons.length === 0) return null;
  const tally = new Map<string, number>();
  for (const reason of reasons) tally.set(reason, (tally.get(reason) ?? 0) + 1);
  return [...tally.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

export async function collectOrchestratorState(input: { now?: Date } = {}): Promise<OrchestratorState> {
  const now = input.now ?? new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const { start: dayStart, end: dayEnd } = moscowDayBounds(now);

  const [
    conveyor,
    credentials,
    publications,
    signals,
    seoPublishedToday,
    seoPublishedWeek,
    seoLast,
    queueNew,
    queueRejected,
    neverSubmitted,
    snapshots,
    dailyCap,
    sources,
    dzen,
    vertexCredentials,
    recentDirectives,
    trend,
    backlinkStatusRaw,
    feedRows,
    lockedSlots,
  ] = await Promise.all([
    conveyorSnapshot({ now }),
    db.aIProviderConfig.findMany({
      where: { provider: { in: [...MARKETING_ACTIVE_PROVIDERS] } },
      select: { provider: true, enabled: true },
    }).catch(() => []),
    db.externalPublication.findMany({
      where: { updatedAt: { gte: dayAgo, lte: now } },
      select: {
        id: true,
        platform: true,
        status: true,
        lastError: true,
        archiveReason: true,
        attemptCount: true,
        agentReviewedAt: true,
        agentWrittenAt: true,
      },
    }).catch(() => []),
    db.marketingAutomationSignal.findMany({
      where: { status: "OPEN" },
      orderBy: [{ severity: "asc" }, { lastSeenAt: "desc" }],
      take: 12,
      select: { key: true, severity: true, title: true, summary: true, firstSeenAt: true },
    }).catch(() => []),
    db.seoLibraryPage.count({
      where: { status: SEO_PAGE_STATUS.published, publishedAt: { gte: dayStart, lt: dayEnd } },
    }).catch(() => 0),
    db.seoLibraryPage.count({
      where: { status: SEO_PAGE_STATUS.published, publishedAt: { gte: weekAgo } },
    }).catch(() => 0),
    db.seoLibraryPage.findFirst({
      where: { status: SEO_PAGE_STATUS.published },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    }).catch(() => null),
    db.seoKeywordCandidate.count({ where: { status: "NEW" } }).catch(() => 0),
    db.seoKeywordCandidate.count({ where: { status: "REJECTED" } }).catch(() => 0),
    db.seoLibraryPage.count({
      where: { status: SEO_PAGE_STATUS.published, submittedAt: null },
    }).catch(() => 0),
    db.marketingDailySnapshot.findMany({
      orderBy: { dayKey: "desc" },
      take: 2,
      select: {
        impressions: true,
        clicks: true,
        averagePosition: true,
        searchablePages: true,
      },
    }).catch(() => []),
    seoPagesPerDay(),
    readSearchSources(now),
    // Проба сессии, а не заполненности полей: «настроено» и «площадка нас
    // узнаёт» — разные утверждения (урок Meta, B685).
    dzenBrowserHealth().catch(() => null),
    db.aIProviderCredential.count({
      where: { provider: "GEMINI", label: VERTEX_CREDENTIAL_LABEL, enabled: true },
    }).catch(() => 0),
    db.agentDirective.findMany({
      where: { createdAt: { gte: weekAgo } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { key: true, action: true, problem: true, appliedAt: true, status: true },
    }).catch(() => []),
    collectTrend({ now }).catch((error: unknown) => {
      log.warn("orchestrator.trend_failed", { error: serializeError(error) });
      return { days: [], weeks: [], diversity: [], duplicateDraftIds: [] } satisfies TrendState;
    }),
    db.platformSetting
      .findUnique({ where: { key: BACKLINK_STATUS_KEY }, select: { value: true } })
      .then((row) => row?.value ?? null)
      .catch(() => null),
    db.externalPublication.groupBy({
      by: ["platform"],
      where: { status: "PUBLISHED", publishedAt: { not: null } },
      _max: { publishedAt: true },
    }).then(async (last) => {
      const fortnight = await db.externalPublication.groupBy({
        by: ["platform"],
        where: { status: "PUBLISHED", publishedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60_000) } },
        _count: { _all: true },
      });
      return { last, fortnight };
    }).catch((error: unknown) => {
      log.warn("orchestrator.feeds_failed", { error: serializeError(error) });
      return null;
    }),
    db.externalPublication.findMany({
      where: {
        status: "ARCHIVED",
        planSlot: { not: null },
        scheduledFor: { gt: now },
        publishedAt: null,
        agentReviewedAt: null,
        attemptCount: 0,
        agentWriterDraft: { equals: Prisma.DbNull },
      },
      orderBy: { scheduledFor: "asc" },
      take: 100,
      select: { id: true },
    }).catch((error: unknown) => {
      log.warn("orchestrator.locked_slots_failed", { error: serializeError(error) });
      return [] as Array<{ id: string }>;
    }),
  ]);

  // Состояние ключей берётся из самих credential'ов: именно их двигает
  // сторожевая проба (`provider-health.ts`), и именно по ним панель считает
  // «готов/не готов». Судить по строке провайдера значило бы судить по
  // выключателю, а не по дороге.
  const credentialHealth = await db.aIProviderCredential.findMany({
    where: { provider: { in: [...MARKETING_ACTIVE_PROVIDERS] }, enabled: true },
    select: { provider: true, lastSuccessAt: true, lastErrorAt: true, lastErrorCode: true },
  }).catch((error: unknown) => {
    log.warn("orchestrator.credentials_failed", { error: serializeError(error) });
    return [] as Array<{
      provider: string;
      lastSuccessAt: Date | null;
      lastErrorAt: Date | null;
      lastErrorCode: string | null;
    }>;
  });

  const enabledByProvider = new Map(credentials.map((row) => [String(row.provider), row.enabled]));
  const bestByProvider = new Map<string, ProviderState>();
  for (const row of credentialHealth) {
    const key = String(row.provider);
    const candidate: ProviderState = {
      provider: key,
      enabled: enabledByProvider.get(key) ?? false,
      lastSuccessAt: row.lastSuccessAt,
      lastErrorAt: row.lastErrorAt,
      lastErrorCode: row.lastErrorCode,
    };
    const seen = bestByProvider.get(key);
    // У провайдера может быть несколько ключей. Берём самый живой: провайдер
    // считается рабочим, если работает ХОТЬ ОДИН его ключ.
    if (!seen || (candidate.lastSuccessAt?.getTime() ?? 0) > (seen.lastSuccessAt?.getTime() ?? 0)) {
      bestByProvider.set(key, candidate);
    }
  }

  const byPlatform = new Map<string, { published: number; stalled: number; reasons: string[] }>();
  const causeTally = new Map<string, number>();
  const stalledIds: string[] = [];
  for (const row of publications) {
    const platform = row.platform.trim().toLowerCase();
    const bucket = byPlatform.get(platform) ?? { published: 0, stalled: 0, reasons: [] };
    if (row.status === "PUBLISHED") bucket.published += 1;
    // B747: пустая оболочка, снятая уборкой очереди (ни автора, ни редактора,
    // ни попытки выпуска), — не отказ материала. Посчитанная как отказ, она
    // становится «повторяющейся причиной», и 15.09 оркестратор предложил
    // переписать промт SMM из-за пометки разовой чистки B746.
    const emptyShell = row.status === "ARCHIVED"
      && row.attemptCount === 0 && !row.agentReviewedAt && !row.agentWrittenAt;
    if ((row.status === "FAILED" || row.status === "ARCHIVED") && !emptyShell) {
      bucket.stalled += 1;
      const reason = (row.archiveReason ?? row.lastError ?? "").trim();
      if (reason) bucket.reasons.push(reason.slice(0, 120));
      // Причина нормализуется тем же переводчиком, что и суточная сводка
      // владельцу: два разных текста одной болезни обязаны считаться вместе,
      // иначе ни один не дорастёт до порога.
      const human = humanCause(row.archiveReason ?? row.lastError);
      if (human) causeTally.set(human, (causeTally.get(human) ?? 0) + 1);
      stalledIds.push(row.id);
    }
    byPlatform.set(platform, bucket);
  }

  return {
    now,
    conveyor,
    providers: [...bestByProvider.values()],
    platforms: [...byPlatform.entries()].map(([platform, bucket]) => ({
      platform,
      published: bucket.published,
      stalled: bucket.stalled,
      topReason: topReasonOf(bucket.reasons),
    })),
    signals,
    seo: {
      publishedToday: seoPublishedToday,
      publishedWeek: seoPublishedWeek,
      dailyCap,
      queueNew,
      queueRejected,
      neverSubmitted,
      lastPublishedAt: seoLast?.publishedAt ?? null,
    },
    search: {
      impressions: snapshots[0]?.impressions ?? null,
      clicks: snapshots[0]?.clicks ?? null,
      averagePosition: snapshots[0]?.averagePosition ?? null,
      searchablePages: snapshots[0]?.searchablePages ?? null,
      previousImpressions: snapshots[1]?.impressions ?? null,
    },
    sources,
    thinCards: thinCards().length,
    dzen,
    vertexConfigured: vertexCredentials > 0,
    trend,
    backlinks: backlinkTargetsWithStatus(parseBacklinkStatus(backlinkStatusRaw)),
    recentDirectives,
    causes: [...causeTally.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
    stalledIds,
    feeds: feedsFrom(feedRows, [...new Set(contentPlanFor(now).map((slot) => slot.channel))]),
    lockedSlotIds: lockedSlots.map((row) => row.id),
  };
}

/**
 * Выпуск по площадкам ДЕЙСТВУЮЩЕГО плана. Площадка без единого выпуска тоже
 * попадает в список: её тишина — самая громкая. `null` на входе (база не
 * ответила) даёт пустой список, а не «везде ноль»: ложная тревога о тишине
 * всех площадок хуже пропущенного прохода.
 */
export function feedsFrom(
  rows: {
    last: Array<{ platform: string; _max: { publishedAt: Date | null } }>;
    fortnight: Array<{ platform: string; _count: { _all: number } }>;
  } | null,
  plannedPlatforms: readonly string[],
): FeedOutput[] {
  if (!rows) return [];
  // Регистр площадки в реестре не единый (`lower(platform)` в запросах, B686):
  // «Telegram» и «telegram» — одна лента, и сводятся они вместе.
  const norm = (value: string) => value.trim().toLowerCase();
  return plannedPlatforms.map((platform) => {
    const lastTimes = rows.last
      .filter((row) => norm(row.platform) === platform)
      .map((row) => row._max.publishedAt?.getTime() ?? 0);
    const latest = Math.max(0, ...lastTimes);
    return {
      platform,
      lastPublishedAt: latest > 0 ? new Date(latest) : null,
      publishedFortnight: rows.fortnight
        .filter((row) => norm(row.platform) === platform)
        .reduce((sum, row) => sum + row._count._all, 0),
    };
  });
}
