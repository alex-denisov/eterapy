/**
 * B740 — ЗАКРЫТЫЙ СЛОВАРЬ ДЕЙСТВИЙ ОРКЕСТРАТОРА.
 *
 * Владелец 2026-09-12 дал полную автономию с одним условием: «он должен сам
 * мне писать перед тем как внедрить изменения». Автономия без словаря — это не
 * автономия, а произвольная запись в базу: агент, которому разрешено «менять
 * настройки», однажды поменяет ту, о существовании которой никто не помнил.
 *
 * Поэтому здесь перечислено ВСЁ, что оркестратор вправе сделать, и у каждого
 * действия три обязательных свойства:
 *
 *  1. СНИМОК «ДО». Без него нет отката, а значит нет и права на автономию.
 *  2. ГРАНИЦЫ. Числовая настройка имеет потолок и пол; ключ настройки —
 *     из белого списка; промт — только у ролей маркетингового контура.
 *  3. РОД РИСКА. `reversible` применяется сразу после отчёта; `monetary` и
 *     `irreversible` не применяются вовсе — они только докладываются.
 *     Разница не в осторожности, а в том, что откат первого стоит одной
 *     строки, а откат второго — денег или снятой с индекса страницы.
 */

import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { updateAIPromptConfig } from "@/lib/ai-gateway/prompts";
import { AIProvider } from "@prisma/client";

export type DirectiveRisk = "reversible" | "monetary" | "irreversible";

export type DirectiveAction =
  | "set_setting"
  | "toggle_platform"
  | "toggle_provider"
  | "update_prompt"
  | "requeue_publications"
  | "resolve_signal";

export interface OrchestratorDirective {
  key: string;
  target: "smm" | "seo" | "pool" | "conveyor" | "platform";
  action: DirectiveAction;
  payload: Record<string, unknown>;
  problem: string;
  rationale: string;
  risk: DirectiveRisk;
}

/**
 * Настройки, которые оркестратору разрешено трогать, и их границы.
 *
 * ⚠ ГРАНИЦЫ НЕ ДЕКОРАТИВНЫЕ. `marketing.conveyor.max_awaiting_review` = 0
 * остановил бы линию полностью, а `seo.pages_per_day` = 200 за ночь превратил
 * бы Библиотеку в ферму. Обе «правки» выглядят как обычное число в JSON.
 */
export const SETTING_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  "seo.pages_per_day": { min: 1, max: 8, label: "страниц Библиотеки в сутки" },
  "marketing.conveyor.max_awaiting_review": { min: 2, max: 12, label: "потолок очереди редактора" },
};

/**
 * ⚠ ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Шаг такта воркера (`MARKETING_AGENT_CYCLE_MS`)
 * читается один раз при старте процесса, и настройка с таким именем ничего бы
 * не изменила — только создала бы отчёт, в котором написано «шаг изменён», при
 * неизменном поведении. Настройка попадает в этот список ТОЛЬКО после того,
 * как её действительно кто-то читает в рантайме: так `seo.pages_per_day` и
 * `marketing.conveyor.max_awaiting_review` и получили своих читателей (B740).
 */

/** Булевы настройки из белого списка — выключатели самих агентов. */
export const TOGGLE_SETTINGS = new Set([
  "seo.page_agent.enabled",
  "marketing.agent.enabled",
]);

/**
 * Роли, чей промт оркестратор вправе переписать.
 *
 * Диалоговые и продуктовые промты сюда не входят и входить не будут: они
 * обслуживают живых клиентов, и правка «ради конверсии SMM» меняла бы то, что
 * человек получает за деньги.
 */
export const EDITABLE_PROMPT_FEATURES = new Set([
  "marketing-agent-writer",
  "marketing-agent-reviewer",
  "marketing-reply-writer",
  "marketing-reply-reviewer",
  "seo-library-writer",
  "seo-library-editor",
]);

export const ORCHESTRATOR_ACTOR = "service:marketing-orchestrator";

export interface DirectiveOutcome {
  applied: boolean;
  previous: Record<string, unknown> | null;
  error?: string;
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.platformSetting
    .findUnique({ where: { key }, select: { value: true } })
    .catch(() => null);
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string) {
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: ORCHESTRATOR_ACTOR },
    update: { value, updatedBy: ORCHESTRATOR_ACTOR },
  });
}

function platformSettingKey(platform: string) {
  return `marketing.connector.${platform.trim().toLowerCase()}.enabled`;
}

/**
 * Применение одной директивы.
 *
 * ⚠ НИКОГДА НЕ БРОСАЕТ. Отказ одной правки не имеет права уносить остальные и
 * тем более проход воркера: оркестратор — надстройка, и её падение не должно
 * останавливать производство, которым она управляет.
 */
export async function applyDirective(directive: OrchestratorDirective): Promise<DirectiveOutcome> {
  if (directive.risk !== "reversible") {
    return {
      applied: false,
      previous: null,
      error: `правка рода «${directive.risk}» только докладывается, но не применяется автоматически`,
    };
  }
  try {
    switch (directive.action) {
      case "set_setting": {
        const key = String(directive.payload.key ?? "");
        const bounds = SETTING_BOUNDS[key];
        if (!bounds) return { applied: false, previous: null, error: `настройка «${key}» вне белого списка` };
        const value = Number(directive.payload.value);
        if (!Number.isFinite(value)) {
          return { applied: false, previous: null, error: "значение не число" };
        }
        if (value < bounds.min || value > bounds.max) {
          return {
            applied: false,
            previous: null,
            error: `значение ${value} вне границ ${bounds.min}…${bounds.max} (${bounds.label})`,
          };
        }
        const previous = await readSetting(key);
        await writeSetting(key, String(Math.round(value)));
        return { applied: true, previous: { key, value: previous } };
      }

      case "toggle_platform": {
        const platform = String(directive.payload.platform ?? "");
        if (!platform) return { applied: false, previous: null, error: "площадка не названа" };
        const enabled = directive.payload.enabled === true;
        const key = platformSettingKey(platform);
        const previous = await readSetting(key);
        await writeSetting(key, enabled ? "true" : "false");
        return { applied: true, previous: { key, value: previous } };
      }

      case "toggle_provider": {
        const raw = String(directive.payload.provider ?? "");
        if (!(raw in AIProvider)) {
          return { applied: false, previous: null, error: `провайдер «${raw}» не существует` };
        }
        const provider = raw as AIProvider;
        const enabled = directive.payload.enabled === true;
        const row = await db.aIProviderConfig.findUnique({
          where: { provider },
          select: { enabled: true },
        });
        if (!row) return { applied: false, previous: null, error: "у провайдера нет строки настроек" };
        await db.aIProviderConfig.update({ where: { provider }, data: { enabled } });
        return { applied: true, previous: { provider, enabled: row.enabled } };
      }

      case "update_prompt": {
        const feature = String(directive.payload.feature ?? "");
        if (!EDITABLE_PROMPT_FEATURES.has(feature)) {
          return { applied: false, previous: null, error: `промт «${feature}» оркестратору не подчиняется` };
        }
        const promptText = String(directive.payload.promptText ?? "").trim();
        if (promptText.length < 200) {
          // Короткий промт у роли — это почти наверняка обрезанный ответ модели,
          // а не решение. Роли конвейера живут на текстах в тысячи символов.
          return { applied: false, previous: null, error: "новый промт подозрительно короткий" };
        }
        const existing = await db.aIPromptConfig.findUnique({
          where: { feature },
          select: { promptText: true, title: true },
        });
        await updateAIPromptConfig(ORCHESTRATOR_ACTOR, {
          feature,
          promptText,
          title: existing?.title,
        });
        return { applied: true, previous: { feature, promptText: existing?.promptText ?? null } };
      }

      case "requeue_publications": {
        const ids = Array.isArray(directive.payload.ids)
          ? directive.payload.ids.filter((id): id is string => typeof id === "string")
          : [];
        if (ids.length === 0) return { applied: false, previous: null, error: "нечего возвращать в работу" };
        const rows = await db.externalPublication.findMany({
          where: { id: { in: ids } },
          select: { id: true, status: true },
        });
        await db.externalPublication.updateMany({
          where: { id: { in: ids } },
          data: { status: "PLANNED", lastError: null, archiveReason: null },
        });
        return { applied: true, previous: { rows } };
      }

      case "resolve_signal": {
        const key = String(directive.payload.signalKey ?? "");
        if (!key) return { applied: false, previous: null, error: "сигнал не назван" };
        const row = await db.marketingAutomationSignal.findUnique({
          where: { key },
          select: { status: true },
        });
        if (!row) return { applied: false, previous: null, error: "сигнала нет на доске" };
        await db.marketingAutomationSignal.update({
          where: { key },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
        return { applied: true, previous: { key, status: row.status } };
      }

      default: {
        const exhaustive: never = directive.action;
        return { applied: false, previous: null, error: `неизвестное действие ${String(exhaustive)}` };
      }
    }
  } catch (error) {
    log.error("orchestrator.apply_failed", {
      key: directive.key,
      action: directive.action,
      error: serializeError(error),
    });
    return {
      applied: false,
      previous: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Человеческое имя действия — для отчёта владельцу, а не для лога. */
export function describeDirective(directive: OrchestratorDirective): string {
  switch (directive.action) {
    case "set_setting": {
      const key = String(directive.payload.key ?? "");
      const label = SETTING_BOUNDS[key]?.label ?? key;
      return `${label} → ${String(directive.payload.value)}`;
    }
    case "toggle_platform":
      return `${directive.payload.enabled === true ? "включить" : "выключить"} площадку ${String(directive.payload.platform)}`;
    case "toggle_provider":
      return `${directive.payload.enabled === true ? "вернуть" : "вывести"} провайдера ${String(directive.payload.provider)}`;
    case "update_prompt":
      return `переписать промт роли ${String(directive.payload.feature)}`;
    case "requeue_publications": {
      const ids = Array.isArray(directive.payload.ids) ? directive.payload.ids.length : 0;
      return `вернуть в работу материалов: ${ids}`;
    }
    case "resolve_signal":
      return `снять с доски сигнал ${String(directive.payload.signalKey)}`;
    default:
      return directive.action;
  }
}
