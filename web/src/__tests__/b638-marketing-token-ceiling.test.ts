/**
 * B638 — потолок токенов SMM-агента и честное имя причины.
 *
 * Замер прода 2026-07-31 04:12 MSK: writer 585 123 токена за 74 запроса при
 * потолке 600 000, reviewer 402 176 при потолке 400 000. Агент встал о НАШ
 * счётчик, а не о квоту провайдера — и сообщил при этом «кончилась ёмкость
 * провайдеров». Владелец пошёл бы проверять ключи там, где менять нужно было
 * наше число.
 */

import { isOwnBudgetCeiling } from "@/lib/marketing/agent";
import { DEFAULT_AI_TASK_POLICIES } from "@/lib/ai-gateway/task-policy";

function budgetFor(feature: string): number {
  const policy = DEFAULT_AI_TASK_POLICIES.find((entry) => entry.feature === feature);
  if (!policy?.dailyTokenBudget) throw new Error(`no budget for ${feature}`);
  return policy.dailyTokenBudget;
}

describe("B638 · потолок токенов SMM-агента", () => {
  it("потолок выше суточного расхода с запасом, а не впритык к нему", () => {
    // Наблюдавшийся расход — ориентир, а не норма: потолок должен оставаться
    // предохранителем от разгона, срабатывающим на порядок реже.
    expect(budgetFor("marketing-agent-writer")).toBeGreaterThanOrEqual(3_000_000);
    expect(budgetFor("marketing-agent-reviewer")).toBeGreaterThanOrEqual(2_000_000);
  });

  it("у ответов людям своя ёмкость, и её нельзя занять выпуском плана", () => {
    // B628: два кошелька, а не один. Проверяем, что подъём потолков не свёл
    // их обратно в общий.
    const replyWriter = budgetFor("marketing-reply-writer");
    const planWriter = budgetFor("marketing-agent-writer");
    expect(replyWriter).toBeGreaterThan(0);
    expect(replyWriter).not.toBe(planWriter);
    expect(budgetFor("marketing-reply-reviewer")).toBeGreaterThan(0);
  });

  it("наш потолок отличается от отказа провайдера — действия у них разные", () => {
    expect(isOwnBudgetCeiling("AI feature daily token budget exceeded")).toBe(true);
    expect(isOwnBudgetCeiling("GROQ: AI feature daily token budget exceeded")).toBe(true);
    expect(isOwnBudgetCeiling("Cerebras completion failed: 402 status code")).toBe(false);
    expect(isOwnBudgetCeiling("no free provider returned valid structured output")).toBe(false);
  });
});
