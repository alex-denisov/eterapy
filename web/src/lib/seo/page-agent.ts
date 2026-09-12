/**
 * B740 — SEO-АГЕНТ: ОТ ЗАПРОСА ЧЕЛОВЕКА ДО ВЫПУЩЕННОЙ СТРАНИЦЫ.
 *
 * Требование владельца 2026-09-12: несколько раз в сутки искать в Wordstat и
 * Google Trends запросы, с которыми люди приходят к задачам платформы, и по
 * ним выпускать страницу Библиотеки с корректными title/description/H1 и
 * конверсией в услугу — «по наиболее простому циклу, какой только возможен».
 *
 * ПРОСТЕЙШИЙ ЦИКЛ ЗДЕСЬ — ЭТО БАЗА, А НЕ КОММИТ. Статический корпус требует
 * коммита и полной пересборки образа (≈12 минут) на каждую страницу. Строка в
 * `seo_library_pages` выпускает страницу за секунду, а перевыкатка её не
 * трогает: Postgres — отдельная служба с томом, и `docker compose up`
 * подменяет образ веба, не касаясь данных.
 *
 * ⚠ ТРИ ОГРАНИЧИТЕЛЯ, БЕЗ КОТОРЫХ ЭТО БЫЛА БЫ ФЕРМА ДОРВЕЕВ.
 *  1. Рубеж глубины (`page-gate.ts`). Ниже 450 собственных слов страница не
 *     выпускается вовсе — ровно за такие страницы Яндекс снял корпус с индекса
 *     2026-08-17 (B714).
 *  2. Суточный потолок. Библиотека, выросшая на сорок страниц за ночь, — это
 *     сигнал «ферма» в чистом виде, независимо от качества текста.
 *  3. Один запрос — одна страница. Память о закрытых фразах живёт в
 *     `seo_keyword_candidates`, а не в поиске по корпусу.
 */

import { AIProvider } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import db from "@/lib/db";
import { APP_URL } from "@/lib/env";
import { log, serializeError } from "@/lib/logger";
import { toSlug } from "@/lib/slug";
import { getV5Product } from "@/lib/v5-products";
import { resolveLibraryCta } from "@/lib/library-cta";
import { upsertMarketingSignal, resolveMarketingSignal } from "@/lib/marketing/agent";
import { marketingPoolAvailability } from "@/lib/marketing/pool-capacity";
import { marketingProviderOrder } from "@/lib/marketing/model-pool";
import { ctaProductForService, topicForService, SEO_PAGE_STATUS } from "@/lib/seo/library-store";
import {
  SEO_PAGE_KIND,
  backfilledInWindow,
  nextCardToBackfill,
  seoBackfillPerDay,
} from "@/lib/seo/backfill";
import { buildCorpusIndex, checkUniqueness, type CorpusEntry } from "@/lib/seo/uniqueness";
import { approvedLibraryEntries } from "@/data/anonymous-library";
import { libraryEntriesWithBackfill } from "@/lib/seo/library-store";
import {
  SEO_LIBRARY_BACKFILL_SYSTEM_PROMPT,
  seoLibraryBackfillPrompt,
  type SeoBackfillBrief,
} from "@/lib/seo/page-prompt";
import {
  blockingViolations,
  draftText,
  inspectSeoPageDraft,
  ownWordCount,
  type SeoPageDraft,
} from "@/lib/seo/page-gate";
import {
  SEO_LIBRARY_EDITOR_FEATURE,
  SEO_LIBRARY_EDITOR_SYSTEM_PROMPT,
  SEO_LIBRARY_WRITER_FEATURE,
  SEO_LIBRARY_WRITER_SYSTEM_PROMPT,
  seoLibraryEditorPrompt,
  seoLibraryWriterPrompt,
  type SeoPageBrief,
} from "@/lib/seo/page-prompt";

/** Умолчание суточного потолка. Настройка в базе его переопределяет. */
export const SEO_PAGES_PER_DAY = Math.max(1, Number(process.env.SEO_PAGES_PER_DAY || 4));
export const SEO_PAGES_PER_DAY_KEY = "seo.pages_per_day";
/** Границы — те же, что в белом списке оркестратора. */
export const SEO_PAGES_PER_DAY_MIN = 1;
export const SEO_PAGES_PER_DAY_MAX = 8;

/**
 * B740 — ПОТОЛОК ЧИТАЕТСЯ ИЗ БАЗЫ, А НЕ ТОЛЬКО ИЗ ОКРУЖЕНИЯ.
 *
 * Оркестратор умеет его поднимать, когда очередь запросов растёт быстрее
 * выпуска. Пока значение жило только в `process.env`, прочитанном на старте
 * процесса, такая правка была бы записью в таблицу, которую никто не читает:
 * настройка меняется, поведение — нет, а владельцу в отчёте написано «потолок
 * поднят». Механизм с ручным перезапуском воркера — невыполненный механизм.
 */
export async function seoPagesPerDay(): Promise<number> {
  const row = await db.platformSetting
    .findUnique({ where: { key: SEO_PAGES_PER_DAY_KEY }, select: { value: true } })
    .catch(() => null);
  const parsed = Number(row?.value);
  if (!Number.isFinite(parsed)) return SEO_PAGES_PER_DAY;
  return Math.min(SEO_PAGES_PER_DAY_MAX, Math.max(SEO_PAGES_PER_DAY_MIN, Math.round(parsed)));
}
/** Сколько раундов правки разрешено одному материалу. */
export const SEO_MAX_REVIEW_ROUNDS = 2;
/** Сколько обращений к моделям стоит один материал. Выше — материал умирает от расхода. */
export const SEO_MAX_ATTEMPTS_PER_PAGE = 8;
export const SEO_WRITER_MAX_TOKENS = 8_000;
export const SEO_EDITOR_MAX_TOKENS = 1_500;

const ENABLED_KEY = "seo.page_agent.enabled";

export async function seoPageAgentEnabled(): Promise<boolean> {
  const row = await db.platformSetting
    .findUnique({ where: { key: ENABLED_KEY }, select: { value: true } })
    .catch(() => null);
  if (row?.value) return row.value === "true";
  // По умолчанию включён: выключатель заводится решением человека, а не
  // отсутствием строки в базе. Иначе на чистой базе агент молчал бы, и это
  // выглядело бы как поломка.
  return process.env.SEO_PAGE_AGENT_ENABLED !== "false";
}

/** Московская дата — потолок суточный именно в московских сутках, как и у конвейера. */
export function moscowDayBounds(now: Date): { start: Date; end: Date } {
  const msk = new Date(now.getTime() + 3 * 60 * 60_000);
  const startMsk = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate());
  const start = new Date(startMsk - 3 * 60 * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

/**
 * Разбор JSON, отданного моделью.
 *
 * Модели регулярно оборачивают ответ в ```json … ``` вопреки прямому запрету в
 * промте. Это не повод сжигать обращение: обёртка снимается, а вот текст ДО и
 * ПОСЛЕ объекта — нет, потому что он означает, что модель отвечала не тем,
 * чем просили.
 */
export function parseModelJson(raw: string): Record<string, unknown> {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("модель отдала ответ без JSON-объекта");
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("модель отдала не объект");
  }
  return parsed as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => str(item)).filter((item) => item.length > 0)
    : [];
}

export function writerDraftFrom(payload: Record<string, unknown>): SeoPageDraft {
  const body = Array.isArray(payload.body)
    ? payload.body
      .map((raw) => {
        const section = (raw ?? {}) as Record<string, unknown>;
        return { heading: str(section.heading), paragraphs: strList(section.paragraphs) };
      })
      .filter((section) => section.heading.length > 0 && section.paragraphs.length > 0)
    : [];
  const faqs = Array.isArray(payload.faqs)
    ? payload.faqs
      .map((raw) => {
        const faq = (raw ?? {}) as Record<string, unknown>;
        return { question: str(faq.question), answer: str(faq.answer) };
      })
      .filter((faq) => faq.question.length > 0 && faq.answer.length > 0)
    : [];
  const draft: SeoPageDraft = {
    question: str(payload.question),
    metaTitle: str(payload.metaTitle),
    metaDescription: str(payload.metaDescription),
    summary: str(payload.summary),
    body,
    mainForkTitle: str(payload.mainForkTitle),
    mainForkNote: str(payload.mainForkNote),
    perspectives: strList(payload.perspectives),
    faqs,
    firstStep: str(payload.firstStep),
  };
  if (!draft.question || !draft.summary) {
    throw new Error("в ответе нет обязательных полей question/summary");
  }
  return draft;
}

export interface SeoEditorVerdict {
  verdict: "APPROVE" | "REVISE" | "REJECT";
  notes: string[];
  reason: string;
}

export function editorVerdictFrom(payload: Record<string, unknown>): SeoEditorVerdict {
  const raw = str(payload.verdict).toUpperCase();
  const verdict = raw === "APPROVE" || raw === "REVISE" || raw === "REJECT" ? raw : "REVISE";
  return { verdict, notes: strList(payload.notes), reason: str(payload.reason) };
}

interface ModelCall {
  provider: AIProvider;
  model: string;
  text: string;
}

/**
 * Один структурный вызов с перебором пула.
 *
 * ⚠ ПЕРЕБОР ОСТАНАВЛИВАЕТСЯ ПО БЮДЖЕТУ МАТЕРИАЛА, А НЕ ПО ДЛИНЕ ПУЛА. Урок
 * B699/B703: провайдер, отказавший по квоте, стоит обращения, а обращения
 * считаются на материал. Без общего счётчика материал умирает от расхода, а не
 * от качества, и понять это по логу невозможно.
 */
async function completeStructured(input: {
  feature: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  seed: string;
  role: "writer" | "reviewer";
  excludeModel?: string | null;
  attempts: { used: number };
  available: readonly AIProvider[];
}): Promise<ModelCall> {
  const order = marketingProviderOrder(input.seed, [], input.available, { role: input.role });
  const failures: string[] = [];
  for (const provider of order) {
    if (input.attempts.used >= SEO_MAX_ATTEMPTS_PER_PAGE) break;
    input.attempts.used += 1;
    try {
      const response = await aiComplete({
        feature: input.feature,
        dataClass: "PUBLIC_MARKETING",
        providerOrder: [provider],
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      });
      // Независимость ролей держится моделью, а не провайдером: один провайдер
      // может отдать обеим ролям одну строку каталога, и тогда «независимая
      // проверка» проверяет сама себя (B623).
      if (input.excludeModel && response.model === input.excludeModel) {
        failures.push(`${provider}: та же модель, что у автора (${response.model})`);
        continue;
      }
      return {
        provider: provider as AIProvider,
        model: response.model,
        text: response.text,
      };
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`ни один маршрут пула не ответил. Отказы: ${failures.slice(-4).join("; ") || "нет"}`);
}

/** Бриф для автора: всё, что он обязан знать, и ничего, что он решает сам. */
export async function briefFor(candidate: {
  displayPhrase: string;
  monthlyDemand: number | null;
  growth: number | null;
  service: string | null;
}): Promise<SeoPageBrief> {
  const topic = topicForService(candidate.service);
  const ctaProduct = ctaProductForService(candidate.service);
  const cta = resolveLibraryCta({ topic, ctaProduct });
  const product = getV5Product(cta.slug as never);
  const recent = await db.seoLibraryPage
    .findMany({
      where: { topic, status: SEO_PAGE_STATUS.published },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: { question: true },
    })
    .catch(() => [] as Array<{ question: string }>);
  return {
    targetQuery: candidate.displayPhrase,
    monthlyDemand: candidate.monthlyDemand,
    growth: candidate.growth,
    topic,
    ctaProduct,
    ctaPromise: product?.summary ?? "разбор вашего вопроса специалистами платформы",
    ctaPath: `/products/${cta.slug}`,
    recentTitles: recent.map((row) => row.question),
  };
}

/** Уникальный слаг: к транслиту запроса добавляется суффикс, если адрес занят. */
export async function uniqueSlugFor(query: string): Promise<string> {
  const base = toSlug(query).slice(0, 70).replace(/-+$/g, "") || `vopros-${Date.now().toString(36)}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await db.seoLibraryPage.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface SeoPageCycleResult {
  enabled: boolean;
  /** Почему за проход не вышло ни одной страницы. Одна причина, самая связывающая. */
  idleReason: string | null;
  published: string | null;
  rejected: string | null;
  attempts: number;
  publishedToday: number;
}

const IDLE: SeoPageCycleResult = {
  enabled: false,
  idleReason: null,
  published: null,
  rejected: null,
  attempts: 0,
  publishedToday: 0,
};

/**
 * Заход агента. Выпускает НЕ БОЛЕЕ одной страницы.
 *
 * Одна за проход намеренно: проход идёт несколько раз в сутки, и материал,
 * написанный в спешке пачкой, стоит ровно столько же вызовов моделей, сколько
 * четыре материала по одному, но разбирать его качество уже некому.
 */
export async function runSeoPageCycle(input: { now?: Date } = {}): Promise<SeoPageCycleResult> {
  if (!await seoPageAgentEnabled()) return { ...IDLE };
  const now = input.now ?? new Date();
  const { start, end } = moscowDayBounds(now);

  const [publishedToday, dailyCap] = await Promise.all([
    db.seoLibraryPage.count({
      where: { status: SEO_PAGE_STATUS.published, publishedAt: { gte: start, lt: end } },
    }),
    seoPagesPerDay(),
  ]);
  if (publishedToday >= dailyCap) {
    return {
      ...IDLE,
      enabled: true,
      publishedToday,
      idleReason: `суточный потолок выбран: ${publishedToday} из ${dailyCap}`,
    };
  }

  const candidate = await db.seoKeywordCandidate.findFirst({
    where: { status: "NEW" },
    // Измеренный спрос вперёд растущего: у растущего запроса из Trends нет
    // абсолютной частотности, и поставить его первым значило бы предпочесть
    // неизвестное известному.
    orderBy: [{ monthlyDemand: "desc" }, { growth: "desc" }, { firstSeenAt: "asc" }],
  });
  if (!candidate) {
    return { ...IDLE, enabled: true, publishedToday, idleReason: "очередь запросов пуста — сбор спроса ничего не дал" };
  }

  const availability = await marketingPoolAvailability(now).catch(() => null);
  const available = availability?.providers ?? [];
  if (available.length === 0) {
    return {
      ...IDLE,
      enabled: true,
      publishedToday,
      idleReason: "ни один провайдер пула не доступен — все ключи на остывании",
    };
  }

  // Фраза уходит в работу ДО первого вызова модели: иначе второй проход на
  // другой ноде флота взял бы её же и заплатил за тот же материал дважды.
  await db.seoKeywordCandidate.update({
    where: { id: candidate.id },
    data: { status: "PLANNED" },
  });

  const attempts = { used: 0 };
  const [brief, corpus] = await Promise.all([briefFor(candidate), corpusIndex()]);
  let draft: SeoPageDraft | null = null;
  let writer: ModelCall | null = null;
  let reviewer: ModelCall | null = null;
  let verdict: SeoEditorVerdict | null = null;
  let uniquenessVerdict: ReturnType<typeof checkUniqueness> | null = null;
  let notes: string[] = [];
  let round = 0;

  try {
    while (round < SEO_MAX_REVIEW_ROUNDS + 1) {
      round += 1;
      writer = await completeStructured({
        feature: SEO_LIBRARY_WRITER_FEATURE,
        systemPrompt: SEO_LIBRARY_WRITER_SYSTEM_PROMPT,
        userPrompt: seoLibraryWriterPrompt(brief, notes),
        maxTokens: SEO_WRITER_MAX_TOKENS,
        temperature: 0.7,
        seed: `${candidate.phrase}:${round}`,
        role: "writer",
        attempts,
        available,
      });
      draft = writerDraftFrom(parseModelJson(writer.text));

      const violations = inspectSeoPageDraft({ draft, targetQuery: brief.targetQuery });
      const blocking = blockingViolations(violations);

      /**
       * B741 — УНИКАЛЬНОСТЬ ПРОВЕРЯЕТСЯ МАШИНОЙ, А НЕ РЕДАКТОРОМ.
       *
       * Редактор корпуса не помнит и помнить не может: ему на вход идёт один
       * материал. Заметить, что абзац почти дословно повторяет страницу
       * трёхнедельной давности, способен только счёт по шинглам.
       *
       * Проверка стоит ЗДЕСЬ, вместе с остальным машинным гейтом, а не после
       * вердикта: неуникальный текст не выпустится в любом случае, и платить
       * за суждение о нём незачем.
       */
      uniquenessVerdict = checkUniqueness({ text: draftText(draft), corpus });
      if (!uniquenessVerdict.unique && uniquenessVerdict.reason) {
        blocking.push({ kind: "blocking", message: uniquenessVerdict.reason });
      }

      // ⚠ РЕДАКТОРА НЕ ЗОВЁМ, ПОКА МАШИНА НЕ ДОВОЛЬНА. Вердикт по материалу,
      // который заведомо не выпустится, — это оплаченное обращение за
      // сведения, которые у нас уже есть.
      if (blocking.length > 0 && round <= SEO_MAX_REVIEW_ROUNDS) {
        notes = blocking.map((violation) => violation.message);
        continue;
      }
      if (blocking.length > 0) {
        throw new Error(`материал не проходит гейт: ${blocking.map((v) => v.message).join("; ")}`);
      }

      reviewer = await completeStructured({
        feature: SEO_LIBRARY_EDITOR_FEATURE,
        systemPrompt: SEO_LIBRARY_EDITOR_SYSTEM_PROMPT,
        userPrompt: seoLibraryEditorPrompt({
          brief,
          draftJson: JSON.stringify(draft),
          machineFindings: violations.map((violation) => violation.message),
          round,
          previousNotes: notes,
        }),
        maxTokens: SEO_EDITOR_MAX_TOKENS,
        temperature: 0.2,
        seed: `${candidate.phrase}:review:${round}`,
        role: "reviewer",
        excludeModel: writer.model,
        attempts,
        available,
      });
      verdict = editorVerdictFrom(parseModelJson(reviewer.text));

      if (verdict.verdict === "APPROVE") break;
      if (verdict.verdict === "REJECT") {
        await db.seoKeywordCandidate.update({
          where: { id: candidate.id },
          data: { status: "REJECTED", rejectReason: verdict.reason || "редактор отклонил тему" },
        });
        log.info("seo-page-agent.rejected", { phrase: candidate.phrase, reason: verdict.reason });
        return {
          enabled: true,
          idleReason: null,
          published: null,
          rejected: candidate.phrase,
          attempts: attempts.used,
          publishedToday,
        };
      }
      notes = verdict.notes;
      if (round > SEO_MAX_REVIEW_ROUNDS) {
        throw new Error(`раунды правки не сошлись: ${verdict.notes.slice(0, 3).join("; ")}`);
      }
    }

    if (!draft || !writer || !verdict || verdict.verdict !== "APPROVE") {
      throw new Error("материал не дошёл до утверждения");
    }

    const slug = await uniqueSlugFor(brief.targetQuery);
    await db.seoLibraryPage.create({
      data: {
        slug,
        kind: SEO_PAGE_KIND.page,
        topic: brief.topic,
        status: SEO_PAGE_STATUS.published,
        question: draft.question,
        summary: draft.summary,
        metaTitle: draft.metaTitle,
        metaDescription: draft.metaDescription,
        body: draft.body,
        perspectives: draft.perspectives,
        faqs: draft.faqs,
        mainForkTitle: draft.mainForkTitle || null,
        mainForkNote: draft.mainForkNote || null,
        firstStep: draft.firstStep || null,
        ctaProduct: brief.ctaProduct,
        targetQuery: brief.targetQuery,
        targetDemand: brief.monthlyDemand,
        demandSource: candidate.source,
        cluster: candidate.cluster,
        writerProvider: writer.provider,
        writerModel: writer.model,
        reviewerProvider: reviewer?.provider ?? null,
        reviewerModel: reviewer?.model ?? null,
        review: { verdict: verdict.verdict, reason: verdict.reason, notes: verdict.notes },
        uniqueness: {
          worstContainment: uniquenessVerdict?.worstContainment ?? 0,
          worstAgainst: uniquenessVerdict?.worstAgainst ?? null,
          selfRepeat: uniquenessVerdict?.selfRepeat ?? 0,
        },
        reviewRounds: round,
        publishedAt: now,
        reviewedAt: now,
      },
    });
    await db.seoKeywordCandidate.update({
      where: { id: candidate.id },
      data: { status: "USED", pageSlug: slug },
    });

    log.info("seo-page-agent.published", {
      slug,
      phrase: candidate.phrase,
      words: ownWordCount(draft),
      rounds: round,
      attempts: attempts.used,
    });
    await resolveMarketingSignal("seo:page-agent").catch(() => undefined);

    return {
      enabled: true,
      idleReason: null,
      published: slug,
      rejected: null,
      attempts: attempts.used,
      publishedToday: publishedToday + 1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Фраза возвращается в очередь: отказ маршрута или несошедшиеся раунды —
    // это состояние прохода, а не приговор запросу. Счётчик попыток здесь не
    // нужен: `lastSeenAt` и так двигается сбором, а вечный цикл по одной фразе
    // ограничен суточным потолком страниц.
    await db.seoKeywordCandidate
      .update({ where: { id: candidate.id }, data: { status: "NEW" } })
      .catch(() => undefined);
    log.error("seo-page-agent.failed", { phrase: candidate.phrase, error: serializeError(error) });
    await upsertMarketingSignal({
      key: "seo:page-agent",
      kind: "SEO_AUDIT",
      severity: "WARNING",
      title: "SEO-агент не довёл страницу до выпуска",
      summary: `Запрос «${candidate.displayPhrase}»: ${message}`,
      evidence: { phrase: candidate.phrase, attempts: attempts.used, at: now.toISOString() },
    }).catch(() => undefined);
    return {
      enabled: true,
      idleReason: message,
      published: null,
      rejected: null,
      attempts: attempts.used,
      publishedToday,
    };
  }
}

/**
 * B741 — ИНДЕКС КОРПУСА ДЛЯ ПРОВЕРКИ УНИКАЛЬНОСТИ.
 *
 * Строится один раз на заход и включает ВСЁ, что уже опубликовано: и
 * редакционные карточки с дописанными телами, и самостоятельные страницы
 * агента. Проверять только по своим страницам значило бы разрешить агенту
 * пересказать редакционную карточку — то есть ровно тот дубль, из-за которого
 * и заводился гейт.
 */
async function corpusIndex(): Promise<CorpusEntry[]> {
  const [withBackfill, agentPages] = await Promise.all([
    libraryEntriesWithBackfill().catch(() => approvedLibraryEntries()),
    db.seoLibraryPage
      .findMany({
        where: { status: SEO_PAGE_STATUS.published, kind: SEO_PAGE_KIND.page },
        select: { slug: true, summary: true, body: true, faqs: true },
      })
      .catch(() => [] as Array<{ slug: string; summary: string; body: unknown; faqs: unknown }>),
  ]);

  const entries: Array<{ slug: string; text: string }> = withBackfill.map((entry) => ({
    slug: entry.slug,
    text: [
      entry.question,
      entry.summary,
      ...(entry.body ?? []).flatMap((section) => [section.heading, ...section.paragraphs]),
      ...(entry.faqs ?? []).flatMap((faq) => [faq.question, faq.answer]),
      ...entry.perspectives,
    ].join("\n"),
  }));

  for (const page of agentPages) {
    const body = Array.isArray(page.body) ? page.body : [];
    const faqs = Array.isArray(page.faqs) ? page.faqs : [];
    entries.push({
      slug: page.slug,
      text: [
        page.summary,
        ...body.flatMap((raw) => {
          const section = (raw ?? {}) as { heading?: unknown; paragraphs?: unknown };
          return [
            typeof section.heading === "string" ? section.heading : "",
            ...(Array.isArray(section.paragraphs) ? section.paragraphs.filter((x): x is string => typeof x === "string") : []),
          ];
        }),
        ...faqs.flatMap((raw) => {
          const faq = (raw ?? {}) as { question?: unknown; answer?: unknown };
          return [
            typeof faq.question === "string" ? faq.question : "",
            typeof faq.answer === "string" ? faq.answer : "",
          ];
        }),
      ].filter(Boolean).join("\n"),
    });
  }
  return buildCorpusIndex(entries);
}

/** Адрес выпущенной страницы — для отчёта и для переобхода. */
export function seoPageUrl(slug: string): string {
  return new URL(`/library/${slug}`, APP_URL).toString();
}

export interface SeoBackfillCycleResult {
  enabled: boolean;
  idleReason: string | null;
  backfilled: string | null;
  attempts: number;
  backfilledToday: number;
}

/**
 * B741 — ЗАХОД ДОПИСЫВАНИЯ. ОДНА КАРТОЧКА ЗА РАЗ.
 *
 * Отдельный цикл, а не ветка внутри выпуска новых страниц, и это не про
 * аккуратность кода: у двух работ разные потолки, разные промты и разная цена
 * ошибки. Плохая новая страница — это один лишний адрес. Плохое дописывание
 * портит адрес, который УЖЕ стоит в индексе и уже приносит заходы.
 *
 * Поэтому здесь тот же порядок проверок, что у новых страниц, плюс одна своя:
 * дописанное сверяется на уникальность вместе с собственным вопросом и
 * коротким ответом карточки, но САМА карточка из сверки исключается — иначе
 * всякое дописывание браковалось бы за совпадение с тем, что дописывают.
 */
export async function runSeoBackfillCycle(
  input: { now?: Date } = {},
): Promise<SeoBackfillCycleResult> {
  const idle: SeoBackfillCycleResult = {
    enabled: false,
    idleReason: null,
    backfilled: null,
    attempts: 0,
    backfilledToday: 0,
  };
  if (!await seoPageAgentEnabled()) return idle;
  const now = input.now ?? new Date();
  const { start, end } = moscowDayBounds(now);

  const [backfilledToday, dailyCap] = await Promise.all([
    backfilledInWindow(start, end),
    seoBackfillPerDay(),
  ]);
  if (backfilledToday >= dailyCap) {
    return {
      ...idle,
      enabled: true,
      backfilledToday,
      idleReason: `суточный потолок дописывания выбран: ${backfilledToday} из ${dailyCap}`,
    };
  }

  const card = await nextCardToBackfill();
  if (!card) {
    return { ...idle, enabled: true, backfilledToday, idleReason: "тонких карточек не осталось" };
  }

  const availability = await marketingPoolAvailability(now).catch(() => null);
  const available = availability?.providers ?? [];
  if (available.length === 0) {
    return {
      ...idle,
      enabled: true,
      backfilledToday,
      idleReason: "ни один провайдер пула не доступен",
    };
  }

  const entry = card.entry;
  const cta = resolveLibraryCta({ topic: entry.topic, ctaProduct: entry.ctaProduct });
  const product = getV5Product(cta.slug as never);
  const brief: SeoBackfillBrief = {
    question: entry.question,
    summary: entry.summary,
    topic: entry.topic,
    ctaProduct: cta.product,
    ctaPromise: product?.summary ?? "разбор вашего вопроса специалистами платформы",
    ctaPath: `/products/${cta.slug}`,
    existingPoints: [
      ...entry.perspectives,
      ...(entry.mainFork?.title ? [entry.mainFork.title] : []),
    ],
  };

  const attempts = { used: 0 };
  const corpus = await corpusIndex();
  let notes: string[] = [];
  let round = 0;

  try {
    while (round < SEO_MAX_REVIEW_ROUNDS + 1) {
      round += 1;
      const writer = await completeStructured({
        feature: SEO_LIBRARY_WRITER_FEATURE,
        systemPrompt: SEO_LIBRARY_BACKFILL_SYSTEM_PROMPT,
        userPrompt: seoLibraryBackfillPrompt(brief, notes),
        maxTokens: SEO_WRITER_MAX_TOKENS,
        temperature: 0.7,
        seed: `backfill:${entry.slug}:${round}`,
        role: "writer",
        attempts,
        available,
      });
      const payload = parseModelJson(writer.text);

      // Вопрос и короткий ответ берутся у карточки, а не у модели: их менять
      // нельзя, а просить модель повторить их значило бы дать ей шанс изменить.
      const draft = writerDraftFrom({
        ...payload,
        question: entry.question,
        summary: entry.summary,
      });

      const violations = inspectSeoPageDraft({ draft, targetQuery: entry.question });
      const blocking = blockingViolations(violations);
      const uniqueness = checkUniqueness({
        text: draftText(draft),
        corpus,
        // Сама карточка из сверки исключена: её вопрос и короткий ответ входят
        // в проверяемый текст по построению.
        excludeSlug: entry.slug,
      });
      if (!uniqueness.unique && uniqueness.reason) {
        blocking.push({ kind: "blocking", message: uniqueness.reason });
      }

      if (blocking.length > 0 && round <= SEO_MAX_REVIEW_ROUNDS) {
        notes = blocking.map((violation) => violation.message);
        continue;
      }
      if (blocking.length > 0) {
        throw new Error(`дописывание не проходит гейт: ${blocking.map((v) => v.message).join("; ")}`);
      }

      const reviewer = await completeStructured({
        feature: SEO_LIBRARY_EDITOR_FEATURE,
        systemPrompt: SEO_LIBRARY_EDITOR_SYSTEM_PROMPT,
        userPrompt: seoLibraryEditorPrompt({
          brief: {
            targetQuery: entry.question,
            monthlyDemand: null,
            growth: null,
            topic: entry.topic,
            ctaProduct: brief.ctaProduct,
            ctaPromise: brief.ctaPromise,
            ctaPath: brief.ctaPath,
            recentTitles: [],
          },
          draftJson: JSON.stringify(draft),
          machineFindings: violations.map((violation) => violation.message),
          round,
          previousNotes: notes,
        }),
        maxTokens: SEO_EDITOR_MAX_TOKENS,
        temperature: 0.2,
        seed: `backfill:${entry.slug}:review:${round}`,
        role: "reviewer",
        excludeModel: writer.model,
        attempts,
        available,
      });
      const verdict = editorVerdictFrom(parseModelJson(reviewer.text));

      if (verdict.verdict === "REVISE" && round <= SEO_MAX_REVIEW_ROUNDS) {
        notes = verdict.notes;
        continue;
      }
      if (verdict.verdict !== "APPROVE") {
        throw new Error(`редактор не одобрил дописывание: ${verdict.reason || verdict.verdict}`);
      }

      await db.seoLibraryPage.create({
        data: {
          slug: entry.slug,
          kind: SEO_PAGE_KIND.backfill,
          topic: entry.topic,
          status: SEO_PAGE_STATUS.published,
          question: entry.question,
          summary: entry.summary,
          metaTitle: draft.metaTitle,
          metaDescription: draft.metaDescription,
          body: draft.body,
          perspectives: draft.perspectives,
          faqs: draft.faqs,
          mainForkTitle: draft.mainForkTitle || null,
          mainForkNote: draft.mainForkNote || null,
          firstStep: draft.firstStep || null,
          ctaProduct: brief.ctaProduct,
          targetQuery: entry.question,
          targetDemand: null,
          demandSource: "backfill",
          cluster: entry.topic,
          writerProvider: writer.provider,
          writerModel: writer.model,
          reviewerProvider: reviewer.provider,
          reviewerModel: reviewer.model,
          review: { verdict: verdict.verdict, reason: verdict.reason, notes: verdict.notes },
          uniqueness: {
            worstContainment: uniqueness.worstContainment,
            worstAgainst: uniqueness.worstAgainst,
            selfRepeat: uniqueness.selfRepeat,
          },
          reviewRounds: round,
          publishedAt: now,
          reviewedAt: now,
        },
      });

      log.info("seo-backfill.published", {
        slug: entry.slug,
        wordsBefore: card.ownWords,
        rounds: round,
        attempts: attempts.used,
      });
      return {
        enabled: true,
        idleReason: null,
        backfilled: entry.slug,
        attempts: attempts.used,
        backfilledToday: backfilledToday + 1,
      };
    }
    throw new Error("раунды дописывания не сошлись");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("seo-backfill.failed", { slug: entry.slug, error: serializeError(error) });
    return {
      enabled: true,
      idleReason: message,
      backfilled: null,
      attempts: attempts.used,
      backfilledToday,
    };
  }
}
