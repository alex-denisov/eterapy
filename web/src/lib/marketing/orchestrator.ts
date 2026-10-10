/**
 * B740 — ОРКЕСТРАТОР МАРКЕТИНГОВОГО КОНТУРА.
 *
 * Он не пишет постов и не выпускает страниц. Его работа — та, которой до сих
 * пор не делал никто: смотреть на SMM-конвейер и SEO-агента СВЕРХУ, находить,
 * где они стоят, докладывать это человеку словами эксперта и чинить то, что
 * чинится настройкой.
 *
 * ПОРЯДОК ЖЁСТКИЙ И ОН ЖЕ — ТРЕБОВАНИЕ ВЛАДЕЛЬЦА:
 *
 *   собрать состояние → поставить диагноз → ОТЧИТАТЬСЯ → применить.
 *
 * ⚠ ОТЧЁТ УХОДИТ РАНЬШЕ ПРАВКИ, И ЭТО ПРОВЕРЯЕМО. Строка директивы пишется в
 * базу ДО отправки, отметка `reportedAt` ставится ПОСЛЕ доставки, а применение
 * смотрит на эту отметку. Поэтому недоставленный отчёт виден как директива без
 * `reportedAt` — и такая директива не применяется вовсе. Это не осторожность
 * ради осторожности: автономия, о которой владелец узнаёт постфактум, — не то,
 * о чём договаривались.
 *
 * ⚠ ВЫКЛЮЧАТЕЛЬ У ВЛАДЕЛЬЦА ЕСТЬ ВСЕГДА. Настройка `marketing.orchestrator.hold`
 * = `true` оставляет отчёты, но запрещает правки. Автономия без стоп-крана —
 * это не автономия, а отсутствие управления.
 */

import db from "@/lib/db";
import { kpiPressure, qualityBlocksGrowth, type KpiVerdict } from "@/lib/marketing/kpi";
import { arbitrateDirectives } from "@/lib/marketing/orchestrator-arbiter";
import { readKpiVerdicts } from "@/lib/marketing/kpi-readings";
import { log, serializeError } from "@/lib/logger";
import { sendTelegram, sendTelegramPhoto } from "@/lib/telegram";
import { signTrendPayload, trendChartUrl } from "@/lib/marketing/orchestrator-chart-sign";
import type { TrendState } from "@/lib/marketing/orchestrator-trend";
import { absoluteMainUrl } from "@/lib/subdomain";
import { marketingDeliveryTargets } from "@/lib/ops-notification-channel";
import {
  applyDirective,
  describeDirective,
  type OrchestratorDirective,
} from "@/lib/marketing/orchestrator-actions";
import { diagnose, type OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";
import { collectOrchestratorState, type OrchestratorState } from "@/lib/marketing/orchestrator-state";
import { promptAmendmentDirective } from "@/lib/marketing/orchestrator-prompt-amendment";
import { clip, escapeHtml } from "@/lib/marketing/orchestrator-brief";
import { narrativeFor, splitForTelegram } from "@/lib/marketing/orchestrator-report";
import {
  buildDailyBrief,
  buildIncidentAlert,
  reportDecision,
  type BriefDirective,
} from "@/lib/marketing/orchestrator-brief";
import {
  INCIDENT_KEY_PREFIX,
  DELIVERY_RETRY_KEY,
  DELIVERY_RETRY_MS,
  LAST_BRIEF_KEY,
  claimSetting,
  parseDate,
  parseOwnerNotes,
  readSetting,
  releaseSetting,
  writeSetting,
} from "@/lib/marketing/orchestrator-claims";

export { reportDecision } from "@/lib/marketing/orchestrator-brief";

export const ORCHESTRATOR_HOLD_KEY = "marketing.orchestrator.hold";
export const ORCHESTRATOR_ENABLED_KEY = "marketing.orchestrator.enabled";
export const ORCHESTRATOR_REPORT_NOW_KEY = "marketing.orchestrator.report_now";
export const ORCHESTRATOR_NOTES_KEY = "marketing.orchestrator.owner_notes";

/**
 * Шаг оркестратора — сбор и диагноз, а НЕ отчёт.
 *
 * B750: отчётов в сутки один (09:00 МСК), плюс короткий алерт на инцидент и
 * ответ на просьбу владельца. Шаг в час нужен, чтобы инцидент не ждал дольше
 * часа, а презентация вышла вскоре после 09:00, а не к полудню.
 */
export const ORCHESTRATOR_CYCLE_MS = Math.max(
  30 * 60_000,
  Number(process.env.MARKETING_ORCHESTRATOR_CYCLE_MS || 60 * 60_000),
);

/**
 * Дёшево: просил ли владелец отчёт. Воркер спрашивает чаще шага цикла.
 * После сбоя доставки — «нет» до конца паузы, иначе воркер бил бы каждую минуту.
 */
export async function orchestratorReportRequested(now: Date = new Date()): Promise<boolean> {
  if ((await readSetting(ORCHESTRATOR_REPORT_NOW_KEY)) !== "true") return false;
  const retryAt = parseDate(await readSetting(DELIVERY_RETRY_KEY));
  return !(retryAt && retryAt.getTime() > now.getTime());
}

async function settingIsTrue(key: string, fallback: boolean): Promise<boolean> {
  const row = await db.platformSetting
    .findUnique({ where: { key }, select: { value: true } })
    .catch(() => null);
  if (!row) return fallback;
  return row.value === "true";
}

export async function orchestratorEnabled(): Promise<boolean> {
  return settingIsTrue(ORCHESTRATOR_ENABLED_KEY, process.env.MARKETING_ORCHESTRATOR_ENABLED !== "false");
}

export async function orchestratorOnHold(): Promise<boolean> {
  return settingIsTrue(ORCHESTRATOR_HOLD_KEY, false);
}

/**
 * Правки, уже применённые за окно.
 *
 * Ключ директивы содержит дату, поэтому повтор внутри суток отсекается самим
 * ключом. Окно всё равно спрашивается у базы, а не держится в памяти: нод
 * четыре, и счётчик в памяти считал бы четверть.
 */
async function alreadyHandled(keys: readonly string[], now: Date): Promise<{ handled: Set<string>; pending: Set<string> }> {
  if (keys.length === 0) return { handled: new Set(), pending: new Set() };
  const rows = await db.agentDirective
    .findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, status: true, reportedAt: true, createdAt: true },
    })
    .catch(() => [] as Array<{ key: string; status: string; reportedAt: Date | null; createdAt: Date }>);
  /**
   * Строка, заведённая, но не доехавшая до владельца (сбой доставки), НЕ
   * считается обработанной: иначе повтор показал бы пустой отчёт, а правка не
   * применилась бы никогда. Держится двое суток, дальше — устарела.
   */
  const fresh = now.getTime() - 2 * 24 * 60 * 60_000;
  const pending = new Set(
    rows
      .filter((row) => row.status === "PLANNED" && row.reportedAt === null && row.createdAt.getTime() >= fresh)
      .map((row) => row.key),
  );
  return { handled: new Set(rows.map((row) => row.key).filter((key) => !pending.has(key))), pending };
}

export interface OrchestratorCycleResult {
  enabled: boolean;
  onHold: boolean;
  findings: number;
  incidents: number;
  planned: number;
  applied: number;
  failed: number;
  reported: boolean;
  /** Почему проход не отчитывался. `null` — отчёт ушёл. */
  silentReason: string | null;
}

/**
 * B746 — КАРТИНКА ТРЕНДА К ОТЧЁТУ.
 *
 * Байты берутся у сайта (`/api/marketing/orchestrator/trend`, подписанная
 * нагрузка), а не рисуются в воркере: рендер Satori живёт в одном месте.
 * Любой отказ — `null`, и отчёт уходит текстом: картинка дополняет доклад,
 * а не является его условием.
 */
async function trendChartBytes(trend: TrendState, now: Date): Promise<{ bytes: ArrayBuffer; filename: string; contentType: string } | null> {
  if (trend.days.length === 0) return null;
  const signed = signTrendPayload({
    at: now.toISOString(),
    days: trend.days.map((day) => ({
      day: day.day,
      posts: day.posts,
      distinctTitles: day.distinctTitles,
      views: day.views,
      seoPages: day.seoPages,
      impressions: day.impressions,
      clicks: day.clicks,
    })),
    weeks: trend.weeks.map((delta) => ({
      label: delta.label,
      current: delta.current,
      previous: delta.previous,
      better: delta.better,
      unit: delta.unit,
    })),
  });
  if (!signed) return null;
  try {
    const response = await fetch(trendChartUrl(absoluteMainUrl("/"), signed), {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      log.warn("orchestrator.trend_chart_http", { status: response.status });
      return null;
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1_000) return null;
    return { bytes, filename: `trend-${now.toISOString().slice(0, 10)}.png`, contentType: "image/png" };
  } catch (error) {
    log.warn("orchestrator.trend_chart_failed", { error: serializeError(error) });
    return null;
  }
}

async function deliver(message: string, chart?: { bytes: ArrayBuffer; filename: string; contentType: string } | null): Promise<boolean> {
  let targets: string[] = [];
  try {
    targets = await marketingDeliveryTargets();
  } catch (error) {
    log.error("orchestrator.targets_failed", { error: serializeError(error) });
    return false;
  }
  for (const chatId of targets) {
    try {
      // B747: отчёт длиннее предела уходит несколькими сообщениями. Отказ
      // любой части — отказ доставки: половина отчёта хуже, чем его повтор.
      for (const part of splitForTelegram(message)) await sendTelegram(chatId, part);
      // Картинка — вторым сообщением и без права уронить доставку текста.
      if (chart) {
        await sendTelegramPhoto(chatId, "📈 Тренд за 14 дней: постов и разных заголовков, просмотров, страниц Библиотеки, показов и кликов в поиске", chart)
          .catch((error) => log.warn("orchestrator.trend_photo_failed", { error: serializeError(error) }));
      }
      return true;
    } catch (error) {
      log.warn("orchestrator.delivery_failed", {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  log.error("orchestrator.undelivered", { targets: targets.length });
  return false;
}

const IDLE: OrchestratorCycleResult = {
  enabled: false,
  onHold: false,
  findings: 0,
  incidents: 0,
  planned: 0,
  applied: 0,
  failed: 0,
  reported: false,
  silentReason: null,
};

export async function runOrchestratorCycle(
  input: { now?: Date } = {},
): Promise<OrchestratorCycleResult> {
  if (!await orchestratorEnabled()) return { ...IDLE };
  const now = input.now ?? new Date();
  const onHold = await orchestratorOnHold();

  const state = await collectOrchestratorState({ now });
  const diagnosed = diagnose(state);
  const incidents = diagnosed.filter((finding) => finding.severity === "incident").length;

  const kpiVerdicts = await readKpiVerdicts({ period: "month", now }).catch((error: unknown) => {
    log.warn("orchestrator.kpi_read_failed", { error: serializeError(error) });
    return [] as KpiVerdict[];
  });
  const extraDirectives: OrchestratorDirective[] = [];

  /**
   * B740 — правка промта достраивается ЗДЕСЬ, а не в диагнозе.
   *
   * Ей нужен вызов модели за формулировкой правила, а диагноз обязан
   * оставаться чистой функцией: иначе он перестанет быть воспроизводимым, и
   * проверить его прогоном станет нечем.
   *
   * Строится только когда правки вообще применяются: на удержании тратить
   * обращение к модели ради текста, который никуда не поедет, незачем.
   */
  if (!onHold && diagnosed.some((finding) => finding.code === "smm.recurring_cause")) {
    const cause = state.causes[0];
    if (cause) {
      const amendment = await promptAmendmentDirective({
        feature: "marketing-agent-writer",
        role: "автор материалов SMM",
        cause: cause.reason,
        occurrences: cause.count,
        dayKey: now.toISOString().slice(0, 10),
      }).catch(() => null);
      if (amendment) extraDirectives.push(amendment);
    }
  }
  /**
   * B743 — РАЗРЫВ ПО KPI ПРЕВРАЩАЕТСЯ В ПРАВКУ, А НЕ В АБЗАЦ.
   *
   * Владелец просил, чтобы метрики «подстёгивали агентов работать лучше».
   * Подстегнуть текстом нельзя: модель согласится и напишет то же самое.
   * Меняются УСЛОВИЯ работы — норма выпуска страниц, и меняются они числом,
   * внутри того же белого списка границ, что и прочие правки.
   *
   * Правило ограничителя живёт в `kpiPressure`: при просевшем качестве темп
   * не поднимается, даже когда по количеству мы отстаём. Иначе KPI «больше
   * страниц» выполнялся бы выпуском мусора — так и набрался корпус из 199
   * карточек с медианой 65 слов.
   */
  const dayKey = now.toISOString().slice(0, 10);
  for (const move of kpiPressure({ verdicts: kpiVerdicts, seoPagesPerDay: state.seo.dailyCap })) {
    // Правка не заводится, если настройка уже стоит на этом значении: отчёт
    // «изменил на то же самое» — это шум, за который владелец уже выговаривал.
    if (move.setting === "seo.pages_per_day" && move.value === state.seo.dailyCap) continue;
    extraDirectives.push({
      key: `${dayKey}:kpi.${move.setting}`,
      target: "seo",
      action: "set_setting",
      payload: { key: move.setting, value: move.value },
      problem: `разрыв по KPI: ${move.because}`,
      rationale: `Ставлю ${move.value} — это то же правило, по которому метрика и заведена: `
        + "разрыв меняет условия работы, а не формулировку задачи. Значение внутри "
        + "объявленных границ и откатывается одной командой.",
      risk: "reversible",
    });
  }

  // B753: встречные правки одной настройки и рост темпа при просевшем качестве
  // решаются здесь, ДО отчёта, а не взаимным откатом на следующих проходах.
  const arbitrated = arbitrateDirectives({
    findings: diagnosed,
    extra: extraDirectives,
    currentCap: state.seo.dailyCap,
    qualityBlocks: qualityBlocksGrowth(kpiVerdicts),
  });
  const findings = arbitrated.findings;
  const candidates = arbitrated.directives;

  const { handled, pending } = await alreadyHandled(candidates.map((directive) => directive.key), now);
  const directives = onHold
    ? []
    : candidates.filter((directive) => !handled.has(directive.key));

  const lastBriefRaw = await readSetting(LAST_BRIEF_KEY);
  const lastBriefAt = parseDate(lastBriefRaw);
  const retryAt = parseDate(await readSetting(DELIVERY_RETRY_KEY));
  const backoff = retryAt !== null && retryAt.getTime() > now.getTime();
  const reportNow = !backoff && (await readSetting(ORCHESTRATOR_REPORT_NOW_KEY)) === "true";
  const incidentFindings = findings.filter((finding) => finding.severity === "incident");
  const marks = await readIncidentMarks(incidentFindings.map((finding) => finding.code));
  const decision = reportDecision({
    now,
    lastBriefAt,
    reportNow,
    incidents: incidentFindings.map((finding) => finding.code),
    lastIncidentAt: Object.fromEntries(
      Object.entries(marks).map(([code, raw]) => [code, parseDate(raw) ?? undefined]),
    ),
  });

  const base = { enabled: true, onHold, findingsCount: findings.length, incidents };
  const silent = (reason: string): OrchestratorCycleResult => ({
    enabled: true, onHold, findings: findings.length, incidents, planned: 0, applied: 0, failed: 0, reported: false, silentReason: reason,
  });

  if (decision.daily || decision.ownerRequested) {
    return deliverBrief({
      ...base, now, state, findings, directives, candidates, pending, kpiVerdicts, decision, lastBriefRaw, lastBriefAt,
      incidentCodes: incidentFindings.map((finding) => finding.code), marks,
    });
  }
  if (decision.alertCodes.length > 0) {
    return deliverIncidentAlert({
      ...base, now, findings: incidentFindings, directives, pending, codes: decision.alertCodes, marks,
    });
  }
  return silent(decision.reason ?? "нечего отправлять");
}

async function readIncidentMarks(codes: readonly string[]): Promise<Record<string, string>> {
  if (codes.length === 0) return {};
  const rows = await db.platformSetting
    .findMany({
      where: { key: { in: codes.map((code) => `${INCIDENT_KEY_PREFIX}${code}`) } },
      select: { key: true, value: true },
    })
    .catch(() => [] as Array<{ key: string; value: string }>);
  return Object.fromEntries(rows.map((row) => [row.key.slice(INCIDENT_KEY_PREFIX.length), row.value]));
}

/** Строки правок заводятся ДО отправки — недоставленный отчёт виден как директива без отметки. */
async function storeDirectives(
  directives: readonly OrchestratorDirective[],
  pending: ReadonlySet<string>,
): Promise<OrchestratorDirective[]> {
  const stored: OrchestratorDirective[] = [];
  for (const directive of directives) {
    // Строка уже есть от неудавшейся доставки — повторяем отчёт и применение.
    if (pending.has(directive.key)) {
      stored.push(directive);
      continue;
    }
    try {
      await db.agentDirective.create({
        data: {
          key: directive.key,
          target: directive.target,
          action: directive.action,
          payload: directive.payload as never,
          status: "PLANNED",
          problem: directive.problem,
          rationale: directive.rationale,
          risk: directive.risk,
        },
      });
      stored.push(directive);
    } catch (error) {
      // Гонка двух нод: ключ уникален, правку уже завела первая.
      log.info("orchestrator.directive_exists", { key: directive.key, error: serializeError(error) });
    }
  }
  return stored;
}

/** Применение — только ПОСЛЕ доставки. Побочный отказ не откатывает уже вышедший отчёт. */
async function applyStored(
  stored: readonly OrchestratorDirective[],
): Promise<{ applied: number; failed: number; failures: string[] }> {
  const reportedAt = new Date();
  let applied = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const directive of stored) {
    await db.agentDirective
      .update({ where: { key: directive.key }, data: { status: "REPORTED", reportedAt } })
      .catch(() => undefined);
    const outcome = await applyDirective(directive);
    if (outcome.applied) {
      applied += 1;
      await db.agentDirective
        .update({
          where: { key: directive.key },
          data: { status: "APPLIED", appliedAt: new Date(), previous: (outcome.previous ?? undefined) as never },
        })
        .catch(() => undefined);
    } else {
      failed += 1;
      failures.push(`${describeDirective(directive)} — ${outcome.error ?? "причина не названа"}`);
      await db.agentDirective
        .update({
          where: { key: directive.key },
          data: {
            status: directive.risk === "reversible" ? "FAILED" : "SKIPPED",
            failedReason: outcome.error ?? null,
          },
        })
        .catch(() => undefined);
    }
  }
  // Второе сообщение — ТОЛЬКО при отказе: успех уже описан в отчёте.
  if (failures.length > 0) {
    await deliver(`⚠️ <b>Не удалось внедрить</b>\n${failures.map((line) => `• ${escapeHtml(clip(line, 300))}`).join("\n")}`)
      .catch(() => false);
  }
  return { applied, failed, failures };
}

interface CycleBase {
  enabled: boolean;
  onHold: boolean;
  findingsCount: number;
  incidents: number;
}

async function deliverIncidentAlert(input: CycleBase & {
  now: Date;
  findings: readonly OrchestratorFinding[];
  directives: readonly OrchestratorDirective[];
  pending: ReadonlySet<string>;
  codes: readonly string[];
  marks: Record<string, string>;
}): Promise<OrchestratorCycleResult> {
  const { enabled, onHold, findingsCount, incidents } = input;
  // Право на алерт берётся в базе по коду: три ноды — одно сообщение.
  const claimed: string[] = [];
  for (const code of input.codes) {
    const previous = input.marks[code] ?? null;
    if (await claimSetting(`${INCIDENT_KEY_PREFIX}${code}`, previous, input.now.toISOString())) claimed.push(code);
  }
  const release = () => Promise.all(
    claimed.map((code) => releaseSetting(`${INCIDENT_KEY_PREFIX}${code}`, input.marks[code] ?? null)),
  );
  const alerted = input.findings.filter((finding) => claimed.includes(finding.code));
  const result = (patch: Partial<OrchestratorCycleResult>): OrchestratorCycleResult => ({
    enabled, onHold, findings: findingsCount, incidents,
    planned: 0, applied: 0, failed: 0, reported: false, silentReason: null, ...patch,
  });
  if (alerted.length === 0) return result({ silentReason: "алерт по инциденту уже ушёл с другой ноды" });

  // Правки — только у самих инцидентов; остальное ждёт суточной презентации.
  const ownKeys = new Set(alerted.map((finding) => finding.directive?.key).filter(Boolean));
  const stored = await storeDirectives(input.directives.filter((directive) => ownKeys.has(directive.key)), input.pending);
  const delivered = await deliver(buildIncidentAlert({ now: input.now, incidents: alerted }));
  if (!delivered) {
    await release();
    log.error("orchestrator.alert_undelivered", { incidents: alerted.length });
    return result({ planned: stored.length, silentReason: "алерт не доставлен — правки не применяю" });
  }
  const { applied, failed } = await applyStored(stored);
  log.info("orchestrator.incident_alert", { incidents: alerted.length, planned: stored.length, applied, failed });
  return result({ planned: stored.length, applied, failed, reported: true });
}

/** Применённые с прошлой презентации правки — по базе, а не по памяти. */
async function appliedSince(since: Date | null, now: Date): Promise<BriefDirective[]> {
  const from = since ?? new Date(now.getTime() - 24 * 60 * 60_000);
  const rows = await db.agentDirective
    .findMany({
      where: { status: "APPLIED", appliedAt: { gt: from } },
      orderBy: { appliedAt: "desc" },
      take: 3,
    })
    .catch(() => []);
  return rows.map((row) => ({
    key: row.key,
    target: row.target as OrchestratorDirective["target"],
    action: row.action as OrchestratorDirective["action"],
    payload: (row.payload ?? {}) as Record<string, unknown>,
    problem: row.problem,
    rationale: row.rationale,
    risk: row.risk as OrchestratorDirective["risk"],
  }));
}

async function deliverBrief(input: CycleBase & {
  now: Date;
  state: OrchestratorState;
  findings: readonly OrchestratorFinding[];
  directives: readonly OrchestratorDirective[];
  candidates: readonly OrchestratorDirective[];
  pending: ReadonlySet<string>;
  kpiVerdicts: readonly KpiVerdict[];
  decision: ReturnType<typeof reportDecision>;
  lastBriefRaw: string | null;
  lastBriefAt: Date | null;
  incidentCodes: readonly string[];
  marks: Record<string, string>;
}): Promise<OrchestratorCycleResult> {
  const { enabled, onHold, findingsCount, incidents, now, decision } = input;
  const result = (patch: Partial<OrchestratorCycleResult>): OrchestratorCycleResult => ({
    enabled, onHold, findings: findingsCount, incidents,
    planned: 0, applied: 0, failed: 0, reported: false, silentReason: null, ...patch,
  });

  // Право отправить — одно на все ноды: сравнение-и-запись в базе.
  // Заявка владельца занимается ДО отправки (true → false, сравнением), в том
  // числе когда она совпала с суточной: иначе вторая нода отправила бы вторую.
  const dailyClaimed = !decision.daily
    || await claimSetting(LAST_BRIEF_KEY, input.lastBriefRaw, now.toISOString());
  if (!dailyClaimed) return result({ silentReason: "презентацию отправляет другая нода" });
  const requestClaimed = !decision.ownerRequested
    || await claimSetting(ORCHESTRATOR_REPORT_NOW_KEY, "true", "false");
  if (!requestClaimed) {
    if (decision.daily) await releaseSetting(LAST_BRIEF_KEY, input.lastBriefRaw);
    return result({ silentReason: "презентацию отправляет другая нода" });
  }
  const rollback = async () => {
    if (decision.daily) await releaseSetting(LAST_BRIEF_KEY, input.lastBriefRaw);
    // false → true только сравнением: запрос, пришедший снова, уже true.
    if (decision.ownerRequested) await claimSetting(ORCHESTRATOR_REPORT_NOW_KEY, "false", "true");
  };

  const stored = await storeDirectives(input.directives, input.pending);
  const applied = await appliedSince(input.lastBriefAt, now);
  const ownerNotes = parseOwnerNotes(await readSetting(ORCHESTRATOR_NOTES_KEY), input.lastBriefAt);
  // Одно необязательное предложение: отказ пула не имеет права задержать отчёт.
  const narrative = input.findings.length > 0
    ? await narrativeFor({ findings: input.findings, directives: stored }).catch(() => null)
    : null;
  const brief = buildDailyBrief({
    state: input.state,
    findings: input.findings,
    planned: stored,
    applied,
    ownerNotes,
    narrative,
  });
  const chart = await trendChartBytes(input.state.trend, now);
  const holdNote = onHold && input.candidates.length > 0
    ? `\n\n⏸ <b>Правки на удержании</b>: <code>${ORCHESTRATOR_HOLD_KEY}</code> = true, ничего не меняю.`
    : "";
  const delivered = await deliver(`${brief}${holdNote}`, chart);

  if (!delivered) {
    await rollback().catch(() => undefined);
    // Пауза: просьба владельца остаётся true, но не повторяется чаще раза в 15 минут.
    await writeSetting(DELIVERY_RETRY_KEY, new Date(now.getTime() + DELIVERY_RETRY_MS).toISOString())
      .catch(() => undefined);
    log.error("orchestrator.report_undelivered", { findings: findingsCount });
    return result({ planned: stored.length, silentReason: "отчёт не доставлен — правки не применяю" });
  }

  // Отметки после доставки — побочные: их сбой не отменяет вышедший отчёт.
  if (decision.ownerRequested && !decision.daily) {
    await writeSetting(LAST_BRIEF_KEY, now.toISOString()).catch(() => undefined);
  }
  await Promise.all(input.incidentCodes.map((code) =>
    writeSetting(`${INCIDENT_KEY_PREFIX}${code}`, now.toISOString()).catch(() => undefined)));

  const outcome = await applyStored(stored);
  log.info("orchestrator.cycle", {
    findings: findingsCount, incidents, planned: stored.length, applied: outcome.applied, failed: outcome.failed,
    daily: decision.daily, ownerRequested: decision.ownerRequested,
  });
  return result({ planned: stored.length, applied: outcome.applied, failed: outcome.failed, reported: true });
}
