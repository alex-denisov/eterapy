/**
 * B753 — АРБИТР ПРАВОК ОДНОЙ НАСТРОЙКИ.
 *
 * Правила оркестратора независимы и каждое по отдельности разумно. Вместе они
 * ломались: «очередь растёт — поднять норму» и «качество просело — снизить норму»
 * оба применялись, оба попадали в отчёт, и значение возвращалось на место.
 * Владелец видел «собираюсь поднять лимит» и ни разу не видел результата.
 *
 * Здесь два правила, и оба чистые функции:
 *  1. Просевшее качество снимает ЛЮБОЕ повышение нормы выпуска. Находка при этом
 *     остаётся в отчёте с причиной — «не поднят, потому что», а не молчание.
 *  2. Если на одну настройку остались встречные правки, выживает осторожная
 *     (меньшее значение): откат осторожной стоит одной строки, а рост корпуса
 *     рывком поисковик читает как ферму.
 */

import type { OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";
import { directivesFrom, type OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";

const PACE_SETTING = "seo.pages_per_day";

function isGrowthOfPace(directive: OrchestratorDirective | undefined, currentCap: number): boolean {
  if (!directive || directive.action !== "set_setting") return false;
  return directive.payload.key === PACE_SETTING && Number(directive.payload.value) > currentCap;
}

export function arbitrateDirectives(input: {
  findings: readonly OrchestratorFinding[];
  extra: readonly OrchestratorDirective[];
  currentCap: number;
  qualityBlocks: boolean;
}): { findings: OrchestratorFinding[]; directives: OrchestratorDirective[] } {
  const findings = input.findings.map((finding): OrchestratorFinding => {
    if (!input.qualityBlocks || !isGrowthOfPace(finding.directive, input.currentCap)) return finding;
    const { directive: _removed, ...rest } = finding;
    return {
      ...rest,
      detail: `${finding.detail} Потолок не поднят: уникальность корпуса ниже цели, рост темпа заблокирован `
        + "ограничителем качества и вернётся, когда качество восстановится.",
    };
  });

  const extra = input.extra.filter(
    (directive) => !(input.qualityBlocks && isGrowthOfPace(directive, input.currentCap)),
  );
  const all = [...directivesFrom(findings), ...extra];

  const winners = new Map<string, OrchestratorDirective>();
  const rest: OrchestratorDirective[] = [];
  for (const directive of all) {
    if (directive.action !== "set_setting") {
      rest.push(directive);
      continue;
    }
    const setting = String(directive.payload.key ?? "");
    const held = winners.get(setting);
    if (!held || Number(directive.payload.value) < Number(held.payload.value)) winners.set(setting, directive);
  }
  return { findings, directives: [...rest, ...winners.values()] };
}
