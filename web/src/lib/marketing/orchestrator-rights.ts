/**
 * B750 — РАСШИРЕННЫЕ ПРАВА ОРКЕСТРАТОРА (SEO и реестр площадок).
 *
 * Владелец 2026-10-04: «расширить права, максимально насколько возможно чтобы
 * не уронить прод, не иметь доступа к финансам и пользователям».
 *
 * Все обработчики здесь сохраняют гарантии словаря `orchestrator-actions.ts`:
 * проверка полезной нагрузки, снимок «до», суточный потолок по московским
 * суткам (считаются применённые директивы этого действия), НИКОГДА не бросают.
 * Таблиц платежей, пользователей и доступов модуль не касается вообще.
 */

import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { getApprovedLibraryEntry } from "@/data/anonymous-library";
import { moscowDayBounds } from "@/lib/seo/page-agent";
import { SEO_DEMAND_FLOOR } from "@/lib/seo/demand-ladder";
import { coveredPhraseSet, normalizePhrase, rejectReasonFor } from "@/lib/seo/demand/harvest";
import { SEO_PAGE_KIND, SEO_PAGE_STATUS } from "@/lib/seo/page-kinds";
import {
  BACKLINK_STATUS_KEY,
  BACKLINK_TARGETS,
  parseBacklinkStatus,
  type BacklinkStepStatus,
} from "@/lib/seo/backlink-targets";
import { submitUrlsForRecrawl } from "@/lib/marketing/seo-coverage";
import type { DirectiveOutcome } from "@/lib/marketing/orchestrator-actions";

const ACTOR = "service:marketing-orchestrator";

export const RIGHTS_DAILY_CAPS = {
  queue_keyword: 10,
  retire_library_page: 3,
  restore_library_page: 3,
  mark_backlink_step: 20,
  recrawl_urls: 20,
} as const;

export const RECRAWL_MAX_PER_DIRECTIVE = 5;
export const RECRAWL_ORIGIN = "https://eterapy.com/";
export const KEYWORD_MAX_DEMAND = 1_000_000;
const NOTE_MAX = 300;

type Payload = Record<string, unknown>;
type RightsAction = keyof typeof RIGHTS_DAILY_CAPS;

const refuse = (error: string): DirectiveOutcome => ({ applied: false, previous: null, error });

/** Сколько директив действия уже применено за московские сутки. */
async function appliedToday(action: RightsAction, now: Date): Promise<{ count: number; payloads: Payload[] }> {
  const { start, end } = moscowDayBounds(now);
  const rows = await db.agentDirective.findMany({
    where: { action, status: "APPLIED", appliedAt: { gte: start, lt: end } },
    select: { payload: true },
    take: 200,
  });
  return {
    count: rows.length,
    payloads: rows.map((row) => (row.payload && typeof row.payload === "object" ? (row.payload as Payload) : {})),
  };
}

async function capReached(action: RightsAction, now: Date): Promise<string | null> {
  const { count } = await appliedToday(action, now);
  const cap = RIGHTS_DAILY_CAPS[action];
  return count >= cap ? `суточный потолок действия ${action}: ${cap}` : null;
}

export async function queueKeyword(payload: Payload, now = new Date()): Promise<DirectiveOutcome> {
  const displayPhrase = String(payload.phrase ?? "").trim();
  const phrase = normalizePhrase(displayPhrase);
  const demand = Number(payload.monthlyDemand);
  if (!phrase) return refuse("фраза не названа");
  if (!Number.isFinite(demand) || demand < SEO_DEMAND_FLOOR || demand > KEYWORD_MAX_DEMAND) {
    return refuse(`частотность вне границ ${SEO_DEMAND_FLOOR}…${KEYWORD_MAX_DEMAND}`);
  }
  const monthlyDemand = Math.round(demand);
  const reason = rejectReasonFor({
    phrase,
    monthlyDemand,
    source: "wordstat",
    coveredPhrases: await coveredPhraseSet(),
  });
  if (reason) return refuse(`фраза не годится: ${reason}`);
  const capped = await capReached("queue_keyword", now);
  if (capped) return refuse(capped);

  const existing = await db.seoKeywordCandidate.findUnique({ where: { phrase } });
  if (existing && existing.status !== "NEW" && existing.status !== "REJECTED") {
    return refuse(`фраза уже в работе (статус ${existing.status})`);
  }
  await db.seoKeywordCandidate.upsert({
    where: { phrase },
    create: { phrase, displayPhrase, source: "orchestrator", monthlyDemand, status: "NEW" },
    update: { monthlyDemand, status: "NEW", rejectReason: null, lastSeenAt: now },
  });
  return {
    applied: true,
    previous: existing
      ? {
          phrase,
          existed: true,
          status: existing.status,
          monthlyDemand: existing.monthlyDemand,
          source: existing.source,
          rejectReason: existing.rejectReason,
        }
      : { phrase, existed: false },
  };
}

async function setLibraryStatus(
  payload: Payload,
  from: string,
  to: string,
  action: RightsAction,
  now: Date,
): Promise<DirectiveOutcome> {
  const slug = String(payload.slug ?? "").trim();
  if (!slug) return refuse("слаг не назван");
  if (getApprovedLibraryEntry(slug)) return refuse("страница редакционного корпуса — вне прав оркестратора");
  const capped = await capReached(action, now);
  if (capped) return refuse(capped);
  const row = await db.seoLibraryPage.findFirst({
    where: { slug, kind: SEO_PAGE_KIND.page },
    select: { slug: true, status: true },
  });
  if (!row) return refuse("такой страницы базы нет");
  if (row.status !== from) return refuse(`статус страницы ${row.status}, ожидался ${from}`);
  await db.seoLibraryPage.update({ where: { slug }, data: { status: to } });
  return { applied: true, previous: { slug: row.slug, status: row.status } };
}

export const RETIRE_APPROVED_KEY = "seo.retire_approved";
export const RETIRE_APPROVED_MAX = 20;

/** Защитный разбор списка одобренных слагов: не строки и лишнее отбрасываются. */
export function parseRetireApproved(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const slugs = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return [...new Set(slugs.map((slug) => slug.trim()))].slice(0, RETIRE_APPROVED_MAX);
  } catch {
    return [];
  }
}

/** Побочное действие вне основной операции: сбой не отменяет уже снятую страницу. */
async function dropFromList(key: string, slug: string): Promise<void> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key }, select: { value: true } });
    const rest = parseRetireApproved(row?.value).filter((item) => item !== slug);
    const value = JSON.stringify(rest);
    await db.platformSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: ACTOR },
      update: { value, updatedBy: ACTOR },
    });
  } catch (error) {
    log.warn("orchestrator.slug_list_cleanup_failed", { key, slug, error: serializeError(error) });
  }
}

export async function retireLibraryPage(payload: Payload, now = new Date()): Promise<DirectiveOutcome> {
  const outcome = await setLibraryStatus(
    payload, SEO_PAGE_STATUS.published, SEO_PAGE_STATUS.retired, "retire_library_page", now,
  );
  if (outcome.applied) await dropFromList(RETIRE_APPROVED_KEY, String(payload.slug ?? "").trim());
  return outcome;
}

export const RESTORE_REQUESTED_KEY = "seo.restore_requested";

export async function restoreLibraryPage(payload: Payload, now = new Date()): Promise<DirectiveOutcome> {
  const outcome = await setLibraryStatus(
    payload, SEO_PAGE_STATUS.retired, SEO_PAGE_STATUS.published, "restore_library_page", now,
  );
  if (outcome.applied) await dropFromList(RESTORE_REQUESTED_KEY, String(payload.slug ?? "").trim());
  return outcome;
}

export async function markBacklinkStep(payload: Payload, now = new Date()): Promise<DirectiveOutcome> {
  const id = String(payload.id ?? "");
  if (!BACKLINK_TARGETS.some((target) => target.id === id)) return refuse(`площадки «${id}» нет в реестре`);
  const status = String(payload.status ?? "") as BacklinkStepStatus;
  if (status !== "done" && status !== "skipped" && status !== "pending") return refuse("статус вне done/skipped/pending");
  const note = String(payload.note ?? "").trim().slice(0, NOTE_MAX);
  const capped = await capReached("mark_backlink_step", now);
  if (capped) return refuse(capped);

  const raw = await db.platformSetting.findUnique({ where: { key: BACKLINK_STATUS_KEY }, select: { value: true } });
  const map = parseBacklinkStatus(raw?.value);
  const before = map[id] ?? null;
  const next = { ...map, [id]: { status, ...(note ? { note } : {}), updatedAt: now.toISOString() } };
  const value = JSON.stringify(next);
  await db.platformSetting.upsert({
    where: { key: BACKLINK_STATUS_KEY },
    create: { key: BACKLINK_STATUS_KEY, value, updatedBy: ACTOR },
    update: { value, updatedBy: ACTOR },
  });
  return { applied: true, previous: { id, entry: before } };
}

/** Адрес допустим, только если это страница нашего origin без учётных данных. */
export function ownSiteUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(RECRAWL_ORIGIN)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "eterapy.com" || url.username || url.password || url.port) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function recrawlUrls(payload: Payload, now = new Date()): Promise<DirectiveOutcome> {
  const raw = Array.isArray(payload.urls) ? payload.urls : [];
  const urls = [...new Set(raw.map(ownSiteUrl))];
  if (urls.length === 0 || urls.some((url) => url === null)) return refuse("адреса не свои или не названы");
  if (urls.length > RECRAWL_MAX_PER_DIRECTIVE) return refuse(`адресов больше ${RECRAWL_MAX_PER_DIRECTIVE} за директиву`);
  const clean = urls as string[];
  const { payloads } = await appliedToday("recrawl_urls", now);
  const used = payloads.reduce((sum, item) => sum + (Array.isArray(item.urls) ? item.urls.length : 0), 0);
  const cap = RIGHTS_DAILY_CAPS.recrawl_urls;
  if (used + clean.length > cap) return refuse(`суточный потолок переобхода: ${cap} адресов`);
  const submitted = await submitUrlsForRecrawl(clean);
  if (submitted.length === 0) return refuse("переобход не принят: Вебмастер не настроен или квота исчерпана");
  return { applied: true, previous: { submitted, requested: clean } };
}

/** Безопасная обёртка: обработчик не имеет права бросать. */
export async function runRightsAction(
  action: RightsAction,
  payload: Payload,
  key: string,
): Promise<DirectiveOutcome> {
  try {
    switch (action) {
      case "queue_keyword": return await queueKeyword(payload);
      case "retire_library_page": return await retireLibraryPage(payload);
      case "restore_library_page": return await restoreLibraryPage(payload);
      case "mark_backlink_step": return await markBacklinkStep(payload);
      case "recrawl_urls": return await recrawlUrls(payload);
    }
  } catch (error) {
    log.error("orchestrator.rights_failed", { key, action, error: serializeError(error) });
    return refuse(error instanceof Error ? error.message : String(error));
  }
}
