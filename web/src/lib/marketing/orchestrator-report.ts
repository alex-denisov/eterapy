/**
 * B740 — ОТЧЁТ ВЛАДЕЛЬЦУ. ПИШЕТСЯ ДО ТОГО, КАК ЧТО-ТО ИЗМЕНЕНО.
 *
 * Требование владельца 2026-09-12 дословно: «полная автономия, но он должен сам
 * мне писать перед тем как внедрить изменения, с комментариями о том, какие
 * проблемы нашел и как он будет их исправлять, пусть у него будет подход как у
 * эксперта, который отчитывается мне как руководителю».
 *
 * Отсюда три свойства текста, и каждое — следствие этой фразы, а не вкус:
 *
 *  1. СНАЧАЛА ПРОБЛЕМА, ПОТОМ ПРАВКА. Руководитель читает, чтобы понять
 *     состояние дел, а не чтобы утвердить список действий.
 *  2. ЧИСЛА, А НЕ ОЦЕНКИ. «Пул деградировал» — это мнение; «Gemini молчит 31 ч,
 *     последний отказ HTTP_429» — это факт, по которому можно возразить.
 *  3. ТЕКСТ СОБИРАЕТСЯ КОДОМ. Модель дописывает к нему связующий абзац, но
 *     отчёт существует и без модели: отказ пула не имеет права превратить
 *     доклад о проблемах в молчание — именно в такие минуты он и нужен.
 */

import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { MARKETING_TOPIC_RADAR_FEATURE } from "@/lib/marketing/model-pool";
import { describeDirective, type OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";

const SEVERITY_MARK: Record<OrchestratorFinding["severity"], string> = {
  incident: "🔴",
  warning: "🟠",
  observation: "⚪",
};

function moscowTime(now: Date): string {
  return now.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Блок «как сейчас» — одни числа, без выводов. */
export function stateBlock(state: OrchestratorState): string[] {
  const lines = [
    "📊 <b>Как сейчас</b>",
    `Конвейер: спрос ${state.conveyor.demand}, готово ${state.conveyor.ready}, `
    + `у редактора ${state.conveyor.awaitingReview}/${state.conveyor.maxAwaitingReview}, `
    + `норма часа ${state.conveyor.perHour}`,
    `Пул: живых провайдеров ${state.providers.filter((p) => p.enabled && p.lastSuccessAt).length} из ${state.providers.length}`,
    `SEO: страниц за сутки ${state.seo.publishedToday}/${state.seo.dailyCap}, `
    + `за неделю ${state.seo.publishedWeek}, в очереди запросов ${state.seo.queueNew}`,
  ];
  const published = state.platforms.filter((platform) => platform.published > 0);
  if (published.length > 0) {
    lines.push(
      `Вышло за сутки: ${published.map((p) => `${p.platform} ${p.published}`).join(", ")}`,
    );
  } else {
    lines.push("Вышло за сутки: ничего");
  }
  if (state.search.impressions !== null) {
    lines.push(
      `Поиск: показов ${state.search.impressions}, кликов ${state.search.clicks ?? 0}`
      + (state.search.averagePosition !== null
        ? `, средняя позиция ${state.search.averagePosition.toFixed(1)}`
        : ""),
    );
  }
  return lines;
}

/** Блок находок. Самое дорогое первым. */
export function findingsBlock(findings: readonly OrchestratorFinding[]): string[] {
  if (findings.length === 0) return ["✅ <b>Проблем не нашёл</b> — контур работает в своих границах."];
  const lines = ["🔍 <b>Что я нашёл</b>"];
  for (const finding of findings.slice(0, 8)) {
    lines.push(`${SEVERITY_MARK[finding.severity]} <b>${finding.title}</b>`);
    lines.push(finding.detail);
  }
  if (findings.length > 8) lines.push(`…и ещё находок: ${findings.length - 8}`);
  return lines;
}

/** Блок правок. Каждая строка — что делаю и почему. */
export function directivesBlock(directives: readonly OrchestratorDirective[]): string[] {
  if (directives.length === 0) {
    return ["🛠 <b>Что меняю</b>\nНичего: ни одна из находок не чинится настройкой контура."];
  }
  const lines = ["🛠 <b>Что меняю прямо сейчас</b>"];
  for (const directive of directives) {
    lines.push(`• ${describeDirective(directive)}`);
    lines.push(`  ${directive.rationale}`);
  }
  lines.push("Все правки обратимы — прежние значения сохранены и откатываются одной командой.");
  return lines;
}

/**
 * Связующий абзац от модели.
 *
 * ⚠ МОДЕЛЬ НЕ ДОБАВЛЯЕТ ФАКТОВ. Ей на вход идут уже готовые находки, и просят
 * её ровно об одном: сказать, что из этого главное и чего ждать дальше. Без
 * этого ограничения она начнёт досочинять причины — а причина, которой не было
 * в числах, читается владельцем как измеренная.
 */
export async function narrativeFor(input: {
  findings: readonly OrchestratorFinding[];
  directives: readonly OrchestratorDirective[];
}): Promise<string | null> {
  if (input.findings.length === 0) return null;
  const facts = input.findings
    .map((finding) => `- [${finding.severity}] ${finding.title}. ${finding.detail}`)
    .join("\n");
  const plan = input.directives.map((directive) => `- ${describeDirective(directive)}`).join("\n");
  try {
    const response = await aiComplete({
      feature: MARKETING_TOPIC_RADAR_FEATURE,
      dataClass: "PUBLIC_MARKETING",
      maxTokens: 500,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: [
            "Ты — руководитель отдела маркетинга платформы ETerapy. Ты докладываешь владельцу.",
            "Тебе дают готовый список находок и готовый план правок. Твоя работа — ОДИН абзац: что из этого главное, что произойдёт, если не чинить, и чего ждать после правок.",
            "Ни одного нового факта, ни одной новой цифры: всё, что ты называешь, должно быть в списке находок.",
            "Три-четыре предложения. По-русски, без восклицаний, без «мы усердно работаем».",
          ].join("\n"),
        },
        { role: "user", content: `НАХОДКИ:\n${facts}\n\nПЛАН:\n${plan || "правок нет"}` },
      ],
    });
    const text = response.text.trim();
    return text.length > 0 ? text.slice(0, 900) : null;
  } catch (error) {
    // Молчание модели не имеет права стать молчанием отчёта.
    log.warn("orchestrator.narrative_failed", { error: serializeError(error) });
    return null;
  }
}

/** Полный текст отчёта. Чистая функция — проверяется прогоном, а не отправкой. */
export function buildOrchestratorReport(input: {
  state: OrchestratorState;
  findings: readonly OrchestratorFinding[];
  directives: readonly OrchestratorDirective[];
  narrative: string | null;
}): string {
  const incidents = input.findings.filter((finding) => finding.severity === "incident").length;
  const header = incidents > 0
    ? `🧭 <b>Отчёт оркестратора · ${incidents} инцидент(ов)</b>`
    : "🧭 <b>Отчёт оркестратора</b>";
  const blocks = [
    `${header}\n${moscowTime(input.state.now)} МСК`,
    ...(input.narrative ? [input.narrative] : []),
    stateBlock(input.state).join("\n"),
    findingsBlock(input.findings).join("\n"),
    directivesBlock(input.directives).join("\n"),
  ];
  return blocks.join("\n\n");
}
