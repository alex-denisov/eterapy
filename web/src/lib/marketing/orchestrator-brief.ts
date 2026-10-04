/**
 * B750 — СУТОЧНАЯ ПРЕЗЕНТАЦИЯ ОРКЕСТРАТОРА И РИТМ ОТЧЁТНОСТИ.
 *
 * Требование владельца 2026-10-04 дословно: «Отчеты писать каждые 6 часов не
 * надо, тем более что они ориентированы на 14-дневный отчет (раз в сутки будет
 * ОК). Мне нужна четкая отчетность, лаконичная, с четкими шагами "что будет
 * делать оркестратор" … как отчет-презентация для руководителя».
 *
 * Три канала, и каждый отвечает на свой вопрос:
 *   — суточная презентация (09:00 МСК): состояние, сделанное, план, просьбы;
 *   — аварийное сообщение: инцидент не ждёт утра, но короткое и без повторов;
 *   — отчёт по просьбе владельца (`report_now`).
 *
 * ⚠ ВСЕ ЧИСЛА — ИЗ СНИМКА СОСТОЯНИЯ, СЛОВО ВЕРДИКТА — ИЗ КОДА. Модель может
 * дописать одно предложение к итогу, но отчёт существует и без неё, а молчащий
 * источник (Яндекс, Google) называется словом, а не пропадает из строки.
 */

import { describeDirective, type OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";
import type { WeekDelta } from "@/lib/marketing/orchestrator-trend";

export type BriefDirective = OrchestratorDirective;

export interface OwnerNote {
  at: string;
  text: string;
}

export const BRIEF_HARD_CAP = 1800;
export const INCIDENT_DEDUPE_MS = 12 * 60 * 60_000;
/** Час суточной презентации по Москве. */
export const BRIEF_HOUR_MSK = 9;
const MSK_OFFSET_MS = 3 * 60 * 60_000;
const MAX_ITEMS = 3;
const MAX_NOTES = 2;

// ── Ритм ────────────────────────────────────────────────────────────────────

/** Сегодняшние 09:00 МСК как момент времени. Москва — UTC+3 без перехода. */
export function briefBoundary(now: Date): Date {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), BRIEF_HOUR_MSK) - MSK_OFFSET_MS,
  );
}

export interface ReportDecision {
  /** Суточная презентация. */
  daily: boolean;
  /** Презентация по просьбе владельца. */
  ownerRequested: boolean;
  /** Коды инцидентов, о которых надо сказать отдельным коротким сообщением. */
  alertCodes: string[];
  /** Почему проход молчит. `null` — что-то уходит. */
  reason: string | null;
}

/**
 * Решение «что отправлять», чистая функция.
 *
 * Дата последней презентации приходит из базы (`platform_settings`), а не из
 * памяти процесса: нод несколько, и память каждой видела бы «сегодня ещё не
 * было».
 */
export function reportDecision(input: {
  now: Date;
  lastBriefAt: Date | null;
  reportNow: boolean;
  incidents: readonly string[];
  lastIncidentAt: Readonly<Record<string, Date | undefined>>;
}): ReportDecision {
  const boundary = briefBoundary(input.now);
  const daily = input.now.getTime() >= boundary.getTime()
    && (input.lastBriefAt === null || input.lastBriefAt.getTime() < boundary.getTime());
  const ownerRequested = input.reportNow;
  if (daily || ownerRequested) {
    // Инцидент входит в презентацию строкой риска — второе сообщение лишнее.
    return { daily, ownerRequested, alertCodes: [], reason: null };
  }
  const alertCodes = [...new Set(input.incidents)].filter((code) => {
    const last = input.lastIncidentAt[code];
    return !last || input.now.getTime() - last.getTime() >= INCIDENT_DEDUPE_MS;
  });
  return {
    daily: false,
    ownerRequested: false,
    alertCodes,
    reason: alertCodes.length > 0 ? null : "презентация по расписанию (09:00 МСК), новых инцидентов нет",
  };
}

// ── Текст ───────────────────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Обрезка по СЫРОМУ тексту — до экранирования и разметки, теги не ломаются. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const match = flat.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : flat;
}

function moscowDate(now: Date): string {
  return now.toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function moscowDateTime(now: Date): string {
  return now.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", "");
}

const SEVERITY_RANK: Record<OrchestratorFinding["severity"], number> = {
  incident: 0,
  warning: 1,
  observation: 2,
};

function bySeverity(findings: readonly OrchestratorFinding[]): OrchestratorFinding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] || a.index - b.index)
    .map(({ finding }) => finding);
}

function relativeChange(delta: WeekDelta): number {
  if (delta.previous === 0) return delta.current === 0 ? 0 : 100;
  return ((delta.current - delta.previous) / delta.previous) * 100;
}

function formatChange(delta: WeekDelta): string {
  if (delta.previous === 0) return delta.current === 0 ? "0" : "с нуля";
  const change = Math.round(relativeChange(delta));
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)} %`;
}

/** Слово вердикта — по крупнейшему сдвигу недели, направление «лучше» — у метрики. */
export function verdictLine(weeks: readonly WeekDelta[]): string {
  const movers = weeks.filter((delta) => delta.current !== delta.previous);
  if (weeks.length === 0) return "Динамика за 7 дней: данных для сравнения нет";
  if (movers.length === 0) return "Динамика за 7 дней: <b>без изменений</b>";
  const top = [...movers].sort((a, b) => Math.abs(relativeChange(b)) - Math.abs(relativeChange(a)))[0];
  const improved = top.better === "up" ? top.current > top.previous : top.current < top.previous;
  return `Динамика за 7 дней: <b>${improved ? "лучше" : "хуже"}</b> — ${escapeHtml(top.label)} `
    + `${formatChange(top)} (${top.previous}${escapeHtml(top.unit)} → ${top.current}${escapeHtml(top.unit)})`;
}

function numbersLine(state: OrchestratorState): string {
  const parts: string[] = [];
  const { webmaster, gsc } = state.sources;
  if (!webmaster && !gsc) parts.push("Яндекс/Google не ответили");
  else if (!webmaster) parts.push("Яндекс не ответил");
  else if (!gsc) parts.push("Google не ответил");
  if (webmaster) parts.push(`в поиске ${webmaster.searchablePages} стр.`);
  const impressions = state.trend.weeks.find((delta) => delta.metric === "impressions");
  const clicks = state.trend.weeks.find((delta) => delta.metric === "clicks");
  if (impressions) parts.push(`показы ${impressions.current} (было ${impressions.previous})`);
  else if (state.search.impressions !== null) parts.push(`показы ${state.search.impressions}`);
  else parts.push("показы: нет замера");
  if (clicks) parts.push(`клики ${clicks.current} (${clicks.previous})`);
  const posts = state.platforms.reduce((sum, platform) => sum + platform.published, 0);
  parts.push(`постов за сутки ${posts}`);
  const enabled = state.providers.filter((provider) => provider.enabled);
  parts.push(`пул ${enabled.filter((provider) => provider.lastSuccessAt).length}/${enabled.length}`);
  return parts.join(" · ");
}

interface BriefInput {
  state: OrchestratorState;
  findings: readonly OrchestratorFinding[];
  /** Правки этого прохода (записаны до отправки, применятся после доставки). */
  planned: readonly BriefDirective[];
  /** Правки, применённые с прошлой презентации. */
  applied: readonly BriefDirective[];
  /** Заметки владельца, записанные с прошлой презентации. */
  ownerNotes: readonly OwnerNote[];
  /** Необязательное предложение модели; пул упал — `null`, и отчёт цел. */
  narrative?: string | null;
}

function ownerItems(state: OrchestratorState, findings: readonly OrchestratorFinding[]) {
  const fromFindings = findings
    .filter((finding) => finding.ownerAction)
    .map((finding) => ({
      finding,
      text: `${finding.ownerAction!.what} → ${finding.ownerAction!.expected}`,
    }));
  const fromBacklinks = state.backlinks
    .filter((target) => target.route === "human" && target.status === "pending")
    .map((target) => ({ finding: null, text: `${target.title} — ${target.humanStep}` }));
  return [...fromFindings, ...fromBacklinks];
}

/** Презентация одним сообщением ≤ BRIEF_HARD_CAP. Чистая функция. */
export function buildDailyBrief(input: BriefInput): string {
  const sorted = bySeverity(input.findings);
  const risk = sorted[0] ?? null;
  const owner = ownerItems(input.state, sorted);
  const shownOwner = owner.slice(0, MAX_ITEMS);
  const ownerFindings = new Set(shownOwner.map((item) => item.finding).filter(Boolean));

  const stepSources: Array<{ kind: "directive"; directive: BriefDirective } | { kind: "finding"; finding: OrchestratorFinding }> = [
    ...input.planned.map((directive) => ({ kind: "directive" as const, directive })),
    ...sorted
      .filter((finding) => !finding.ownerAction && !finding.directive)
      .map((finding) => ({ kind: "finding" as const, finding })),
  ];
  const shownSteps = stepSources.slice(0, MAX_ITEMS);
  const shownFindingSet = new Set<OrchestratorFinding>(ownerFindings as Set<OrchestratorFinding>);
  if (risk) shownFindingSet.add(risk);
  for (const step of shownSteps) if (step.kind === "finding") shownFindingSet.add(step.finding);
  const plannedKeys = new Set(input.planned.map((directive) => directive.key));
  const hiddenFindings = sorted.filter(
    (finding) => !shownFindingSet.has(finding) && !(finding.directive && plannedKeys.has(finding.directive.key)),
  ).length;
  const shownDirectives = shownSteps.filter((step) => step.kind === "directive").length;
  const hidden = hiddenFindings + (input.planned.length - shownDirectives);

  const notes = input.ownerNotes.slice(-MAX_NOTES);
  const sentence = input.narrative ? firstSentence(input.narrative) : "";

  const render = (width: number, withNotes: boolean, withSentence: boolean): string => {
    const lines: string[] = [`🧭 <b>Отчёт оркестратора · ${moscowDate(input.state.now)}</b>`];
    if (withNotes) {
      for (const note of notes) lines.push(`<i>Учёл ваше: ${escapeHtml(clip(note.text, Math.min(width, 110)))}</i>`);
    }
    lines.push("", "<b>ИТОГ</b>", numbersLine(input.state), verdictLine(input.state.trend.weeks));
    const riskText = risk ? `Главный риск: ${escapeHtml(clip(risk.title, width))}` : "Главный риск: заметных нет";
    lines.push(withSentence && sentence ? `${riskText}. ${escapeHtml(clip(sentence, 90))}` : riskText);

    lines.push("", "<b>ЧТО СДЕЛАЛ</b>");
    const done = input.applied.slice(0, MAX_ITEMS);
    if (done.length === 0) lines.push("• с прошлой презентации правок не вносил");
    for (const directive of done) {
      lines.push(
        `• ${escapeHtml(clip(describeDirective(directive), 50))} — ${escapeHtml(clip(directive.problem, 40))} `
        + `→ ${escapeHtml(clip(firstSentence(directive.rationale), Math.max(30, width - 100)))} · проверю завтра`,
      );
    }

    lines.push("", "<b>ЧТО ДЕЛАЮ ДАЛЬШЕ</b>");
    if (shownSteps.length === 0) lines.push("1. новых шагов нет → слежу за показателями · проверю завтра");
    shownSteps.forEach((step, index) => {
      const what = step.kind === "directive"
        ? `${clip(describeDirective(step.directive), 55)} → ${clip(firstSentence(step.directive.rationale), Math.max(30, width - 85))}`
        : `слежу: ${clip(step.finding.title, Math.max(30, width - 60))} → решу по следующему замеру`;
      lines.push(`${index + 1}. ${escapeHtml(what)} · проверю завтра`);
    });

    lines.push("", "<b>ЧТО НУЖНО ОТ ВАС</b>");
    if (shownOwner.length === 0) lines.push("ничего");
    for (const item of shownOwner) lines.push(`• ${escapeHtml(clip(item.text, width))}`);

    lines.push("", "<i>Ответьте сообщением в этом чате — я учту (например: «профили готовы», «пауза»).</i>");
    if (hidden > 0) lines.push(`<i>+${hidden} мелких — в панели</i>`);
    return lines.join("\n");
  };

  // Сужение вместо обрезки хвоста: хвост несёт «что нужно от вас» и призыв ответить.
  for (const width of [150, 130, 110, 90, 70]) {
    for (const [withNotes, withSentence] of [[true, true], [true, false]] as const) {
      const text = render(width, withNotes, withSentence);
      if (text.length <= BRIEF_HARD_CAP) return text;
    }
  }
  return render(60, false, false).slice(0, BRIEF_HARD_CAP);
}

/**
 * Аварийное сообщение: ≤6 строк. Заголовок, до двух инцидентов по две строки
 * (суть и что делаю / чем грозит), хвост со счётчиком остальных.
 */
export function buildIncidentAlert(input: { now: Date; incidents: readonly OrchestratorFinding[] }): string {
  const shown = input.incidents.slice(0, 2);
  const lines = [`🔴 <b>Инцидент · ${moscowDateTime(input.now)} МСК</b>`];
  for (const incident of shown) {
    lines.push(`• <b>${escapeHtml(clip(incident.title, 150))}</b>`);
    lines.push(
      incident.directive
        ? `Делаю: ${escapeHtml(clip(describeDirective(incident.directive), 150))}`
        : escapeHtml(clip(incident.detail, 150)),
    );
  }
  const rest = input.incidents.length - shown.length;
  lines.push(
    `${rest > 0 ? `ещё ${rest} — в утреннем отчёте. ` : "Подробности — в утреннем отчёте. "}Ответьте сообщением — учту.`,
  );
  return lines.join("\n");
}
