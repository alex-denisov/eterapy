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

export type ReportKind = "seo" | "smm";

export interface ReportInput {
  state: OrchestratorState;
  findings: readonly OrchestratorFinding[];
  verdicts: readonly KpiVerdict[];
  /** Правки этого прохода. */
  planned: readonly OrchestratorDirective[];
  /** Правки, применённые с прошлой презентации. */
  applied: readonly OrchestratorDirective[];
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
  const mark = delta.current === delta.previous ? "▫️" : worse(delta) ? "🔻" : "🔺";
  return `${mark} ${delta.label}: ${delta.previous}${delta.unit} → <b>${delta.current}${delta.unit}</b> (${change(delta)})`;
}

function kpiLines(verdicts: readonly KpiVerdict[], agent: ReportKind): string[] {
  const own = verdicts.filter((verdict) => verdict.definition.agent === agent);
  const measured = own.filter((verdict) => verdict.actual !== null);
  const lines = measured.map(
    (verdict) =>
      `${verdict.onTrack ? "🟢" : "🔴"} ${escapeHtml(clip(verdict.definition.title, 48))}: `
      + `<b>${verdict.actual}</b> / цель ${verdict.target}`,
  );
  const blind = own.length - measured.length;
  if (blind > 0) lines.push(`<i>без замера: ${blind} (не засчитываю ни в какую сторону)</i>`);
  return lines.length > 0 ? lines : ["<i>KPI этого направления не измерены</i>"];
}

function doneLines(applied: readonly OrchestratorDirective[], kind: ReportKind): string[] {
  const own = applied.filter((directive) => belongsTo(kind, directive)).slice(0, MAX_ITEMS);
  if (own.length === 0) return ["• правок не вносил"];
  return own.map(
    (directive) =>
      `• ${escapeHtml(clip(describeDirective(directive), 60))} — ${escapeHtml(clip(directive.problem, 60))}`,
  );
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
  return text.length <= REPORT_HARD_CAP ? text : `${text.slice(0, REPORT_HARD_CAP - 1).trimEnd()}…`;
}

function dateOf(now: Date): string {
  return now.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit" });
}

/** SEO: просадки впереди, срез по ключам Wordstat не показывается вовсе. */
export function buildSeoReport(input: ReportInput): string {
  const { state } = input;
  const weeks = (state.trend?.weeks ?? []).filter((delta) => ["impressions", "clicks", "seoPages"].includes(delta.metric));
  const drops = weeks.filter(worse);
  const { webmaster } = state.sources;
  const index = webmaster
    ? `в поиске ${webmaster.searchablePages} из ${webmaster.sitemapUrls} · исключено ${webmaster.excludedPages}`
    : `Яндекс.Вебмастер не ответил: ${state.sources.webmasterError ?? "причина не названа"}`;
  const position = state.search.averagePosition !== null ? ` · позиция ${state.search.averagePosition}` : "";

  const lines = [
    `🔎 <b>SEO · ${dateOf(state.now)}</b>`,
    "",
    `<b>ПРОСАДКИ</b> (неделя к неделе)`,
    ...(drops.length > 0 ? drops.map(deltaLine) : ["▫️ просадок нет"]),
    ...weeks.filter((delta) => !worse(delta)).slice(0, 2).map(deltaLine),
    escapeHtml(`Индекс: ${index}${position}`),
    "",
    "<b>KPI</b>",
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
    .filter((row) => !/^set_setting$/.test(row.action) || !/seo\./.test(row.problem))
    .slice(0, 2);
  const hypotheses = smmApplied.length > 0
    ? smmApplied.map(
      (row) =>
        `• Гипотеза: ${escapeHtml(clip(row.problem, 70))} (правка ${escapeHtml(clip(row.action, 24))}) → `
        + `Результат: ${smmWeeks.length > 0 ? smmWeeks.map((d) => `${d.label} ${change(d)}`).join(", ") : "замера нет"}`,
    )
    : ["• Новых гипотез с прошлого отчёта нет"];

  const lines = [
    `📣 <b>SMM · ${dateOf(state.now)}</b>`,
    "",
    "<b>ПЛОЩАДКИ</b>",
    ...(platformLines.length > 0 ? platformLines : ["• выпусков за сутки нет"]),
    ...smmWeeks.map(deltaLine),
    "",
    "<b>KPI</b>",
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
  const body = text.replace(/^.*\n/, "").replace(/\s+/g, " ").trim();
  let hash = 5381;
  for (let i = 0; i < body.length; i += 1) hash = ((hash * 33) ^ body.charCodeAt(i)) >>> 0;
  return String(hash);
}

export function unchangedLine(kind: ReportKind, now: Date): string {
  const title = kind === "seo" ? "🔎 SEO" : "📣 SMM";
  return `${title} · ${dateOf(now)}: без изменений с прошлого отчёта — показатели, правки и планы те же, повторять не буду.`;
}
