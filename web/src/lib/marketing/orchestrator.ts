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
import { log, serializeError } from "@/lib/logger";
import { sendTelegram } from "@/lib/telegram";
import { marketingDeliveryTargets } from "@/lib/ops-notification-channel";
import {
  applyDirective,
  describeDirective,
  type OrchestratorDirective,
} from "@/lib/marketing/orchestrator-actions";
import { diagnose, directivesFrom } from "@/lib/marketing/orchestrator-diagnosis";
import { collectOrchestratorState } from "@/lib/marketing/orchestrator-state";
import {
  buildOrchestratorReport,
  narrativeFor,
} from "@/lib/marketing/orchestrator-report";

export const ORCHESTRATOR_HOLD_KEY = "marketing.orchestrator.hold";
export const ORCHESTRATOR_ENABLED_KEY = "marketing.orchestrator.enabled";

/** Шаг оркестратора. Шесть часов — четыре доклада в сутки. */
export const ORCHESTRATOR_CYCLE_MS = Math.max(
  30 * 60_000,
  Number(process.env.MARKETING_ORCHESTRATOR_CYCLE_MS || 6 * 60 * 60_000),
);

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
async function alreadyHandled(keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await db.agentDirective
    .findMany({ where: { key: { in: [...keys] } }, select: { key: true } })
    .catch(() => [] as Array<{ key: string }>);
  return new Set(rows.map((row) => row.key));
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
 * Когда молчать.
 *
 * ⚠ НЕ «КОГДА НЕЧЕГО СКАЗАТЬ». Доклад раз в шесть часов о том, что всё в
 * порядке, на третий день перестают читать — и вместе с ним перестают читать
 * доклад, в котором инцидент. Поэтому спокойный проход молчит, а раз в сутки
 * (первый проход после полуночи МСК) отчитывается всё равно: владелец должен
 * отличать «всё хорошо» от «оркестратор умер».
 */
export function shouldReport(input: {
  findings: number;
  directives: number;
  now: Date;
  lastReportAt: Date | null;
}): { report: boolean; reason: string | null } {
  if (input.findings > 0 || input.directives > 0) return { report: true, reason: null };
  const since = input.lastReportAt
    ? input.now.getTime() - input.lastReportAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (since >= 24 * 60 * 60_000) return { report: true, reason: null };
  return { report: false, reason: "находок нет, суточный доклад уже уходил" };
}

async function deliver(message: string): Promise<boolean> {
  let targets: string[] = [];
  try {
    targets = await marketingDeliveryTargets();
  } catch (error) {
    log.error("orchestrator.targets_failed", { error: serializeError(error) });
    return false;
  }
  for (const chatId of targets) {
    try {
      await sendTelegram(chatId, message);
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
  const findings = diagnose(state);
  const incidents = findings.filter((finding) => finding.severity === "incident").length;

  const candidates = directivesFrom(findings);
  const handled = await alreadyHandled(candidates.map((directive) => directive.key));
  const directives = onHold
    ? []
    : candidates.filter((directive) => !handled.has(directive.key));

  const lastReport = await db.agentDirective
    .findFirst({
      where: { reportedAt: { not: null } },
      orderBy: { reportedAt: "desc" },
      select: { reportedAt: true },
    })
    .catch(() => null);
  const decision = shouldReport({
    findings: findings.length,
    directives: directives.length,
    now,
    lastReportAt: lastReport?.reportedAt ?? null,
  });

  if (!decision.report) {
    return {
      enabled: true,
      onHold,
      findings: findings.length,
      incidents,
      planned: 0,
      applied: 0,
      failed: 0,
      reported: false,
      silentReason: decision.reason,
    };
  }

  // Строки заводятся ДО отправки: отчёт, не доехавший до владельца, обязан
  // остаться видимым как директива без отметки, а не исчезнуть вместе с
  // сообщением.
  const stored: OrchestratorDirective[] = [];
  for (const directive of directives) {
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
      // Гонка двух нод: ключ уникален, и вторая нода получает отказ. Это
      // нормальный исход, а не сбой — правку уже завела первая.
      log.info("orchestrator.directive_exists", {
        key: directive.key,
        error: serializeError(error),
      });
    }
  }

  const narrative = await narrativeFor({ findings, directives: stored });
  const message = buildOrchestratorReport({ state, findings, directives: stored, narrative });
  const delivered = await deliver(
    onHold && candidates.length > 0
      ? `${message}\n\n⏸ <b>Правки на удержании</b>\nНастройка <code>${ORCHESTRATOR_HOLD_KEY}</code> = true: диагноз собран, но ничего не меняю.`
      : message,
  );

  if (!delivered) {
    log.error("orchestrator.report_undelivered", { findings: findings.length });
    return {
      enabled: true,
      onHold,
      findings: findings.length,
      incidents,
      planned: stored.length,
      applied: 0,
      failed: 0,
      reported: false,
      silentReason: "отчёт не доставлен — правки не применяю",
    };
  }

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
          data: {
            status: "APPLIED",
            appliedAt: new Date(),
            previous: (outcome.previous ?? undefined) as never,
          },
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

  // Второе сообщение уходит ТОЛЬКО при отказе. Успешная правка уже описана в
  // отчёте, и повторять её значило бы удваивать поток ради нулевой новости.
  if (failures.length > 0) {
    await deliver(
      `⚠️ <b>Не удалось внедрить</b>\n${failures.map((line) => `• ${line}`).join("\n")}`,
    ).catch(() => false);
  }

  log.info("orchestrator.cycle", {
    findings: findings.length,
    incidents,
    planned: stored.length,
    applied,
    failed,
  });

  return {
    enabled: true,
    onHold,
    findings: findings.length,
    incidents,
    planned: stored.length,
    applied,
    failed,
    reported: true,
    silentReason: null,
  };
}
