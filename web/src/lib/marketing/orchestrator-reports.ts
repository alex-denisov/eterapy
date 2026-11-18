/**
 * B752 — ДВА ОТДЕЛЬНЫХ ОТЧЁТА ОРКЕСТРАТОРА: SEO И SMM.
 *
 * Владелец 2026-10-10: «Отчёты отдельными… Мне не нужен срез по SEO по ключевым
 * словам, они ничего нового не дают, а вот просадки уже напрягают». «Все отчёты
 * оркестратора явно одинаковые и ни к чему не приводят». «В отчёте по SMM должно
 * быть всё понятно, в том числе "гипотеза" — "результат"».
 *
 * Общий каркас, чтобы отчёты читались одинаково: KPI (факт / цель / вердикт) →
 * что сделано → что дало → что делаю дальше с ожидаемым эффектом и сроком.
 * Все числа — из снимка состояния, вердикт «лучше / хуже» — из кода, не из модели.
 * Чистые функции: проверяются прогоном на выдуманных данных.
 */

import { describeDirective, type OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";
import type { WeekDelta } from "@/lib/marketing/orchestrator-trend";
import type { KpiVerdict } from "@/lib/marketing/kpi";
import { clip, escapeHtml } from "@/lib/marketing/orchestrator-brief";

export const REPORT_HARD_CAP = 1200;
/** Отпечаток последнего отправленного отчёта по направлению — для антиповтора. */
export const REPORT_DIGEST_PREFIX = "marketing.orchestrator.report_digest.";
const MAX_ITEMS = 3;
const SEO_CODE = /^(seo|search|source)\./;

/** Очередь поручений владельца, не сводящихся к словарю правок (B754). */
export const OWNER_TASKS_KEY = "marketing.orchestrator.owner_tasks";

export interface OwnerTaskRow { understood: string; at: string; status: string; prUrl?: string }

/** Открытые и ждущие ревью поручения. Закрытые и упавшие в отчёт не идут. */
export function parseOpenOwnerTasks(raw: string | null): OwnerTaskRow[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is OwnerTaskRow =>
        !!row && typeof row.understood === "string" && typeof row.at === "string")
      .map((row) => ({ ...row, status: row.status ?? "OPEN" }))
      .filter((row) => ["OPEN", "IN_PROGRESS", "PR_OPENED"].includes(row.status));
  } catch {
    return [];
  }
}

export type ReportKind = "seo" | "smm";

export interface ReportInput {
  state: OrchestratorState;
  findings: readonly OrchestratorFinding[];
  verdicts: readonly KpiVerdict[];
  /** Правки этого прохода. */
  planned: readonly OrchestratorDirective[];
  /** Правки, применённые с прошлой презентации. */
  applied: readonly OrchestratorDirective[];
  /** B754: открытые поручения владельца, которые нельзя выполнить словарём. */
  ownerTasks?: readonly OwnerTaskRow[];
}

export function belongsTo(kind: ReportKind, item: OrchestratorFinding | OrchestratorDirective): boolean {
  const isSeo = "code" in item ? SEO_CODE.test(item.code) : item.target === "seo";
  return kind === "seo" ? isSeo : !isSeo;
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? flat;
}

function change(delta: WeekDelta): string {
  if (delta.previous === 0) return delta.current === 0 ? "0" : "с нуля";
  const pct = Math.round(((delta.current - delta.previous) / delta.previous) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)} %`;
}

function worse(delta: WeekDelta): boolean {
  return delta.better === "up" ? delta.current < delta.previous : delta.current > delta.previous;
}

function deltaLine(delta: WeekDelta): string {
  const status = delta.current === delta.previous ? "Без изменения" : worse(delta) ? "Ухудшение" : "Улучшение";
  return `${status}: ${delta.label}: ${delta.previous}${delta.unit} → <b>${delta.current}${delta.unit}</b> (${change(delta)})`;
}

function kpiLines(verdicts: readonly KpiVerdict[], agent: ReportKind): string[] {
  const own = verdicts.filter((verdict) => verdict.definition.agent === agent);
  const measured = own.filter((verdict) => verdict.actual !== null);
  const lines = measured.map(
    (verdict) =>
      `${verdict.onTrack ? "План выполнен" : "Ниже цели"}: ${escapeHtml(clip(verdict.definition.title, 48))}: `
      + `<b>${verdict.actual}${escapeHtml(verdict.definition.unit)}</b> / цель ${verdict.target}${escapeHtml(verdict.definition.unit)} · Источник: ${escapeHtml(clip(verdict.definition.source, 90))}`,
  );
  for (const verdict of own.filter((item) => item.actual === null)) {
    lines.push(`${escapeHtml(clip(verdict.definition.title, 48))}: замера нет · Источник: ${escapeHtml(clip(verdict.definition.source, 90))}`);
  }
  return lines.length > 0 ? lines : ["<i>KPI этого направления не измерены</i>"];
}

function doneLines(applied: readonly OrchestratorDirective[], kind: ReportKind): string[] {
  const own = applied.filter((directive) => belongsTo(kind, directive)).slice(0, MAX_ITEMS);
  if (own.length === 0) return ["• правок не вносил"];
  return own.map((directive) => {
    const was = directive.previous && "value" in directive.previous ? directive.previous.value : undefined;
    const now = directive.action === "set_setting" ? directive.payload.value : undefined;
    const change = was !== undefined && now !== undefined ? ` (было ${String(was)} → стало ${String(now)})` : "";
    return `• ${escapeHtml(clip(describeDirective(directive), 60))}${escapeHtml(change)} — ${escapeHtml(clip(directive.problem, 60))}`;
  });
}

function planLines(input: ReportInput, kind: ReportKind): string[] {
  const directives = input.planned.filter((directive) => belongsTo(kind, directive));
  const watched = input.findings.filter(
    (finding) => belongsTo(kind, finding) && !finding.directive && !finding.ownerAction,
  );
  const lines = [
    ...directives.map(
      (directive) =>
        `${escapeHtml(clip(describeDirective(directive), 55))} → ожидаю: `
        + `${escapeHtml(clip(firstSentence(directive.rationale), 90))} · проверю завтра`,
    ),
    ...watched.map(
      (finding) => `слежу: ${escapeHtml(clip(finding.title, 80))} → решу по следующему замеру`,
    ),
  ].slice(0, MAX_ITEMS);
  return lines.length === 0 ? ["новых шагов нет → слежу за показателями"] : lines.map((line, i) => `${i + 1}. ${line}`);
}

function ownerLines(input: ReportInput, kind: ReportKind): string[] {
  const fromFindings = input.findings
    .filter((finding) => finding.ownerAction && belongsTo(kind, finding))
    .map((finding) => `${finding.ownerAction!.what} → ${finding.ownerAction!.expected}`);
  const fromBacklinks = kind === "seo"
    ? (input.state.backlinks ?? [])
      .filter((target) => target.route === "human" && target.status === "pending")
      .map((target) => `${target.title} — ${target.humanStep}`)
    : [];
  return [...fromFindings, ...fromBacklinks].slice(0, 2).map((text) => `• ${escapeHtml(clip(text, 110))}`);
}

function finish(lines: string[]): string {
  const text = lines.join("\n");
  if (text.length <= REPORT_HARD_CAP) return text;
  const kept: string[] = [];
  for (const line of lines) {
    if ([...kept, line, "Остальное не поместилось в отчёт."].join("\n").length > REPORT_HARD_CAP) break;
    kept.push(line);
  }
  return [...kept, "Остальное не поместилось в отчёт."].join("\n");
}

function dateOf(now: Date): string {
  return now.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit" });
}

/** SEO: просадки впереди, срез по ключам Wordstat не показывается вовсе. */
export function buildSeoReport(input: ReportInput): string {
  const { state } = input;
  const weeks = (state.trend?.weeks ?? []).filter((delta) => ["impressions", "clicks", "seoPages"].includes(delta.metric));
  const drops = weeks.filter(worse);
  const searchComplete = ["impressions", "clicks"].every((metric) => weeks.some((delta) => delta.metric === metric));
  const { webmaster } = state.sources;
  const index = webmaster
    ? `в поиске Яндекса: ${webmaster.searchablePages} · адресов в sitemap: ${webmaster.sitemapUrls ?? "нет данных"} · исключено: ${webmaster.excludedPages}`
    : `Яндекс.Вебмастер не ответил: ${state.sources.webmasterError ?? "причина не названа"}`;
  const gsc = state.sources.gsc;
  const gscEnd = new Date(state.now.getTime() - 3 * 86_400_000);
  const gscStart = new Date(gscEnd.getTime() - 7 * 86_400_000);
  const gscLine = gsc
    ? `Google Search Console (${gscStart.toISOString().slice(0, 10)}–${gscEnd.toISOString().slice(0, 10)}): показов ${gsc.totals.impressions}, кликов ${gsc.totals.clicks}`
    : `Google Search Console: данных нет (${state.sources.gscError ?? "причина не названа"})`;

  const lines = [
    `<b>SEO · ${dateOf(state.now)}</b>`,
    "",
    `<b>ПРОСАДКИ</b> (7 календарных дней к предыдущим 7, включая сегодня)`,
    "Источник: журнал Библиотеки и суточные поисковые снимки.",
    ...(drops.length > 0 ? drops.map(deltaLine) : searchComplete ? ["По измеренным показателям просадок нет"] : []),
    ...(!searchComplete ? ["Поиск: недостаточно данных для сравнения"] : []),
    ...weeks.filter((delta) => !worse(delta)).slice(0, 2).map(deltaLine),
    escapeHtml(`Индекс: ${index}`),
    escapeHtml(gscLine),
    "",
    "<b>KPI</b> (текущий месяц)",
    ...kpiLines(input.verdicts, "seo"),
    "",
    "<b>СДЕЛАНО</b>",
    ...doneLines(input.applied, "seo"),
    "",
    "<b>ДАЛЬШЕ</b>",
    ...planLines(input, "seo"),
  ];
  const owner = ownerLines(input, "seo");
  if (owner.length > 0) lines.push("", "<b>НУЖНО ОТ ВАС</b>", ...owner);
  const tasks = (input.ownerTasks ?? []).slice(-3);
  if (tasks.length > 0) {
    lines.push("", "<b>ВАШИ ПОРУЧЕНИЯ В ОЧЕРЕДИ</b>", ...tasks.map((task) => `• ${escapeHtml(clip(task.understood, 80))} — ${task.status === "PR_OPENED" ? `PR на ревью: ${escapeHtml(task.prUrl ?? "")}` : task.status === "IN_PROGRESS" ? "исполнитель работает" : "ждёт исполнителя"}`));
  }
  return finish(lines);
}

/** SMM: по площадкам и «гипотеза → результат» по недавно применённым правкам. */
export function buildSmmReport(input: ReportInput): string {
  const { state } = input;
  const platformLines = (state.platforms ?? [])
    .slice(0, 6)
    .map((platform) => {
      const feed = (state.feeds ?? []).find((item) => item.platform === platform.platform);
      const fortnight = feed ? `, за 14 сут ${feed.publishedFortnight}` : "";
      const stalled = platform.stalled > 0
        ? `, встало ${platform.stalled}${platform.topReason ? ` (${clip(platform.topReason, 40)})` : ""}`
        : "";
      return `• ${escapeHtml(platform.platform)}: вышло ${platform.published}${fortnight}${escapeHtml(stalled)}`;
    });
  const smmWeeks = (state.trend?.weeks ?? []).filter((delta) => ["posts", "distinctShare", "views"].includes(delta.metric));
  const smmApplied = (state.recentDirectives ?? [])
    .filter((row) => row.status === "APPLIED" && row.appliedAt)
    .filter((row) => row.target === "smm" || row.target === "conveyor")
    .slice(0, 2);
  const hypotheses = smmApplied.length > 0
    ? smmApplied.map(
      (row) =>
        `• Гипотеза: ${escapeHtml(clip(row.problem, 70))} (правка ${escapeHtml(clip(row.action, 24))}) → `
        + "Результат: причинный эффект не измерен; общая динамика показана выше.",
    )
    : ["• Связанных замеров гипотез пока нет"];

  const lines = [
    `<b>SMM · ${dateOf(state.now)}</b>`,
    "",
    "<b>ПЛОЩАДКИ</b> (последние 24 часа)",
    "Источник: журнал публикаций; просмотры — последние замеры постов за соответствующие 7 дней, включая сегодня.",
    ...(state.platformsAvailable === false ? ["• Журнал публикаций недоступен: число выпусков не определено"] : platformLines.length > 0 ? platformLines : ["• выпусков за сутки нет"]),
    ...smmWeeks.map(deltaLine),
    ...(!smmWeeks.some((delta) => delta.metric === "views") ? ["Просмотры: недостаточно замеров для сравнения"] : []),
    "",
    "<b>KPI</b> (текущий месяц)",
    ...kpiLines(input.verdicts, "smm"),
    "",
    "<b>ГИПОТЕЗА → РЕЗУЛЬТАТ</b>",
    ...hypotheses,
    "",
    "<b>СДЕЛАНО</b>",
    ...doneLines(input.applied, "smm"),
    "",
    "<b>ДАЛЬШЕ</b>",
    ...planLines(input, "smm"),
  ];
  const owner = ownerLines(input, "smm");
  if (owner.length > 0) lines.push("", "<b>НУЖНО ОТ ВАС</b>", ...owner);
  return finish(lines);
}

/**
 * Антиповтор: отпечаток отчёта без даты. Совпал со вчерашним — вместо дубля
 * уходит одна строка «без изменений» с причиной.
 */
export function reportFingerprint(text: string): string {
  const body = text.replace(/^.*\n/, "").replace(/Google Search Console \(\d{4}-\d{2}-\d{2}–\d{4}-\d{2}-\d{2}\)/g, "Google Search Console (период)").replace(/\s+/g, " ").trim();
  let hash = 5381;
  for (let i = 0; i < body.length; i += 1) hash = ((hash * 33) ^ body.charCodeAt(i)) >>> 0;
  return String(hash);
}

export function unchangedLine(kind: ReportKind, now: Date): string {
  const title = kind === "seo" ? "SEO" : "SMM";
  return `${title} · ${dateOf(now)}: без изменений с прошлого отчёта — показатели, правки и планы те же, повторять не буду.`;
}
