/**
 * B754 — ПРИЁМ ЗАДАЧ ВЛАДЕЛЬЦА В КАНАЛЕ.
 *
 * Владелец 2026-10-10: «Диалог мне нужен, чтобы я отдавал задачи новые, а агент
 * их принимал и сам же выполнял, а не ждать, пока я запущу сессию».
 *
 * Первый уровень (согласован 2026-10-10): без исполнения кода. Свободная фраза
 * разбирается моделью в ОДНО действие из узкого списка словаря оркестратора,
 * и выполняет его тот же `applyDirective` с теми же границами, снимком «до» и
 * журналом. Что в список не входит, встаёт в очередь задач владельца с честным
 * «выполнить без выкатки кода не могу».
 *
 * ⚠ МОДЕЛЬ НИЧЕГО НЕ ИСПОЛНЯЕТ. Она выдаёт JSON; код проверяет действие по
 * белому списку, а значения — границами обработчика. Текст владельца очищается
 * от секретов ДО отправки модели и не попадает ни в SQL, ни в shell.
 */

import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { MARKETING_ORCHESTRATOR_REPORT_FEATURE } from "@/lib/marketing/model-pool";
import {
  applyDirective,
  describeDirective,
  ORCHESTRATOR_ACTOR,
  SETTING_BOUNDS,
  type DirectiveAction,
  type OrchestratorDirective,
} from "@/lib/marketing/orchestrator-actions";

import { OWNER_TASKS_KEY } from "@/lib/marketing/orchestrator-reports";
const MAX_TASKS = 30;
const MAX_UNDERSTOOD = 240;

/** Что владелец может поручить свободной фразой. Промты и провайдеры сюда не входят. */
export const INTAKE_ACTIONS: ReadonlySet<DirectiveAction> = new Set([
  "set_setting",
  "toggle_platform",
  "queue_keyword",
  "recrawl_urls",
]);

export interface IntakePlan {
  /** Как модель поняла задачу — одной фразой, по-русски. */
  understood: string;
  /** `null` — задача вне словаря, встаёт в очередь. */
  directive: { action: DirectiveAction; payload: Record<string, unknown> } | null;
}

/** Чистый разбор ответа модели. Любое отклонение от формата — `null`. */
export function parseIntakePlan(raw: string): IntakePlan | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const understood = typeof record.understood === "string" ? record.understood.trim().slice(0, MAX_UNDERSTOOD) : "";
  if (!understood) return null;
  const action = record.action;
  if (typeof action !== "string" || action === "none") return { understood, directive: null };
  if (!INTAKE_ACTIONS.has(action as DirectiveAction)) return { understood, directive: null };
  const payload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
    ? (record.payload as Record<string, unknown>)
    : {};
  return { understood, directive: { action: action as DirectiveAction, payload } };
}

const SYSTEM_PROMPT = [
  "Ты разбираешь поручение владельца платформы ETerapy оркестратору маркетинга.",
  "Верни ТОЛЬКО JSON: {\"understood\": \"как понял, одной русской фразой\", \"action\": \"...\", \"payload\": {...}}.",
  "Допустимые action:",
  `- set_setting: payload {"key": одна из [${Object.keys(SETTING_BOUNDS).join(", ")}], "value": число}`,
  "- toggle_platform: payload {\"platform\": \"telegram|vk|dzen|threads|...\", \"enabled\": true|false}",
  "- queue_keyword: payload {\"phrase\": \"поисковая фраза\", \"monthlyDemand\": число}",
  "- recrawl_urls: payload {\"urls\": [\"https://eterapy.com/...\"]}",
  "- none: если задача не сводится к одному из действий выше (код, дизайн, новая механика, деньги, пользователи).",
  "Не выдумывай числа, которых нет в поручении: если значения нет, верни none.",
].join("\n");

export async function planOwnerTask(text: string): Promise<IntakePlan | null> {
  try {
    const response = await aiComplete({
      feature: MARKETING_ORCHESTRATOR_REPORT_FEATURE,
      dataClass: "PUBLIC_MARKETING",
      maxTokens: 300,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });
    return parseIntakePlan(response.text);
  } catch (error) {
    log.warn("orchestrator.intake_plan_failed", { error: serializeError(error) });
    return null;
  }
}

function targetFor(action: DirectiveAction, payload: Record<string, unknown>): OrchestratorDirective["target"] {
  if (action === "toggle_platform") return "platform";
  if (action === "set_setting" && String(payload.key ?? "").startsWith("marketing.")) return "conveyor";
  return "seo";
}

/**
 * Статусы ведёт внешний исполнитель (`scripts/agents/owner_task_executor.py`):
 * OPEN → IN_PROGRESS → PR_OPENED | FAILED. Сам прод код не исполняет и не мержит.
 */
interface QueuedTask {
  id: string;
  at: string;
  text: string;
  understood: string;
  status: "OPEN" | "IN_PROGRESS" | "PR_OPENED" | "FAILED";
  prUrl?: string;
}

async function enqueueTask(task: Omit<QueuedTask, "id">): Promise<number> {
  const row = await db.platformSetting.findUnique({ where: { key: OWNER_TASKS_KEY }, select: { value: true } });
  let current: QueuedTask[] = [];
  try {
    const parsed = JSON.parse(row?.value ?? "[]") as unknown;
    if (Array.isArray(parsed)) current = parsed as QueuedTask[];
  } catch {
    current = [];
  }
  const next = [...current, { ...task, id: `t${Date.parse(task.at)}` }].slice(-MAX_TASKS);
  await db.platformSetting.upsert({
    where: { key: OWNER_TASKS_KEY },
    create: { key: OWNER_TASKS_KEY, value: JSON.stringify(next), updatedBy: ORCHESTRATOR_ACTOR },
    update: { value: JSON.stringify(next), updatedBy: ORCHESTRATOR_ACTOR },
  });
  return next.length;
}

/** Принять поручение, выполнить, если оно в словаре, иначе поставить в очередь. Возвращает текст ответа. */
export async function acceptOwnerTask(input: {
  text: string;
  messageId: number | null;
  now: Date;
}): Promise<string> {
  const plan = await planOwnerTask(input.text);
  if (!plan) {
    await enqueueTask({ at: input.now.toISOString(), text: input.text, understood: "модель не разобрала", status: "OPEN" });
    return "Принял, но разобрать сразу не смог — записал в очередь задач, учту в отчёте.";
  }
  if (!plan.directive) {
    const place = await enqueueTask({
      at: input.now.toISOString(), text: input.text, understood: plan.understood, status: "OPEN",
    });
    return `Понял так: ${plan.understood}\nЭто не настройка и не очередь — без выкатки кода сам не выполню. `
      + `Записал в очередь задач (№${place}), покажу в отчёте.`;
  }

  const directive: OrchestratorDirective = {
    key: `owner:${input.messageId ?? input.now.getTime()}`,
    target: targetFor(plan.directive.action, plan.directive.payload),
    action: plan.directive.action,
    payload: plan.directive.payload,
    problem: `поручение владельца: ${plan.understood}`,
    rationale: "Поручено владельцем в канале отчётов; выполняется тем же словарём правок, с границами и откатом.",
    risk: "reversible",
  };
  try {
    await db.agentDirective.create({
      data: {
        key: directive.key, target: directive.target, action: directive.action,
        payload: directive.payload as never, status: "REPORTED", reportedAt: input.now,
        problem: directive.problem, rationale: directive.rationale, risk: directive.risk,
      },
    });
  } catch {
    return "Эту команду я уже получал — повторно не применяю.";
  }
  const outcome = await applyDirective(directive);
  await db.agentDirective
    .update({
      where: { key: directive.key },
      data: outcome.applied
        ? { status: "APPLIED", appliedAt: new Date(), previous: (outcome.previous ?? undefined) as never }
        : { status: "FAILED", failedReason: outcome.error ?? null },
    })
    .catch(() => undefined);
  return outcome.applied
    ? `Понял так: ${plan.understood}\nСделано: ${describeDirective(directive)}. Откат возможен, проверю результат в отчёте.`
    : `Понял так: ${plan.understood}\nНе применил: ${outcome.error ?? "причина не названа"}.`;
}
