// B466 — «План сопровождения» (client-level CRM). Pure типы/парсинг для
// ClientCarePlan.goals (Json). Owner-правила: прогресс НЕ авто — AI предлагает
// обновление после сессии (aiSuggestion), практик подтверждает/правит.

export type CarePlanGoalStatus = "new" | "active" | "done";

export interface CarePlanGoal {
  id: string;
  title: string;
  /** 0–100 */
  progress: number;
  status: CarePlanGoalStatus;
}

export function parseCarePlanGoals(raw: unknown): CarePlanGoal[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const goal = item as Record<string, unknown>;
    const title = typeof goal.title === "string" ? goal.title.trim() : "";
    if (!title) return [];
    const progressRaw = Number(goal.progress);
    const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : 0;
    const status: CarePlanGoalStatus = goal.status === "done" ? "done" : goal.status === "new" ? "new" : "active";
    return [{
      id: typeof goal.id === "string" && goal.id ? goal.id : `goal-${title.slice(0, 24)}`,
      title: title.slice(0, 200),
      progress,
      status,
    }];
  }).slice(0, 20);
}

export function sanitizeStringList(raw: unknown, maxItems: number, maxLen = 120): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export const GOAL_STATUS_LABELS: Record<CarePlanGoalStatus, string> = {
  new: "новая",
  active: "в работе",
  done: "достигнута",
};
