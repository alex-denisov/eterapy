/**
 * B713 §3 — исчерпанные круги правки выпускают ЛУЧШЕЕ, а не хоронят всё.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ. Замер прода 03.08–17.08: 21 материал умер с
 * формулировками вида «Неустранённые дефекты из прошлого раунда … Новых
 * блокирующих замечаний нет», «Замечание из предыдущего раунда (превышение
 * лимита на 48 символов) не устранено. Остальные параметры соответствуют
 * требованиям». То есть материал доходил до состояния, в котором редактор
 * возражал ровно по одному пункту — и выбрасывался целиком.
 *
 * Решение владельца 2026-08-17: в последнем круге выпускать лучший черновик, а
 * в маркетинговый канал слать пометку, что материал вышел без полного
 * одобрения редактора и с какими замечаниями.
 *
 * ⚠ ЧТО ЭТО ПРАВИЛО НЕ ОТМЕНЯЕТ. `REJECT` — приговор редактора, и он
 * исполняется как прежде: «доделать» и «негодно» это разные вердикты, и
 * подменять второй первым нельзя. Не выпускается и материал с флагом
 * безопасности или с пустым текстом: там выпускать нечего и незачем.
 *
 * Выбор лучшего — ЧИСТАЯ ФУНКЦИЯ, отделённая от записи в базу, по той же
 * причине, что `conveyorTact` и `planQueueHygiene`: правило, живущее внутри
 * цикла с базой, проверяется только на проде.
 */

export interface ScoredCandidate {
  round: number;
  /** Текст кандидата. Пустой означает, что выпускать нечего. */
  text: string;
  /** Оценки редактора по критериям, 0..5. */
  scores: Record<string, unknown> | null | undefined;
  decision: string;
  /** Флаги безопасности, выставленные автором. */
  safetyFlags?: readonly string[] | null;
  /** Незакрытые замечания последнего круга — уходят в уведомление. */
  issues?: readonly string[] | null;
}

export interface BestDraftChoice<T> {
  candidate: T;
  round: number;
  /** Сумма оценок редактора: по ней и выбран кандидат. */
  score: number;
  /** Что осталось неустранённым — владелец увидит это в канале. */
  outstandingIssues: string[];
}

/**
 * Сумма оценок редактора. Отсутствующая или нечисловая оценка считается нулём:
 * кандидат, которого редактор не оценил, не может обойти оценённого.
 */
export function reviewScore(scores: Record<string, unknown> | null | undefined): number {
  if (!scores || typeof scores !== "object") return 0;
  let total = 0;
  for (const value of Object.values(scores)) {
    const score = Number(value);
    if (Number.isFinite(score) && score > 0) total += score;
  }
  return total;
}

/**
 * Годен ли кандидат к выпуску без полного одобрения.
 *
 * Три отказа, и все три — не про качество текста, а про то, что выпускать
 * нечего или нельзя.
 */
export function releasableWithoutApproval(candidate: ScoredCandidate): boolean {
  if (!candidate.text.trim()) return false;
  if (candidate.decision === "REJECT") return false;
  if ((candidate.safetyFlags?.length ?? 0) > 0) return false;
  return true;
}

/**
 * Лучший из написанного за все круги.
 *
 * `null`, когда выпускать нечего: все кандидаты пусты, отклонены приговором
 * или несут флаг безопасности. Тогда прежний исход (`FAILED`) остаётся в силе.
 *
 * При равных оценках побеждает ПОЗДНИЙ круг: автор правил текст по замечаниям,
 * и при прочих равных поздняя версия ближе к требованиям редактора.
 */
export function pickBestDraft<T extends ScoredCandidate>(
  candidates: readonly T[],
): BestDraftChoice<T> | null {
  const eligible = candidates.filter(releasableWithoutApproval);
  if (eligible.length === 0) return null;

  let best = eligible[0];
  let bestScore = reviewScore(best.scores);
  for (const candidate of eligible.slice(1)) {
    const score = reviewScore(candidate.scores);
    if (score > bestScore || (score === bestScore && candidate.round >= best.round)) {
      best = candidate;
      bestScore = score;
    }
  }

  return {
    candidate: best,
    round: best.round,
    score: bestScore,
    outstandingIssues: [...(best.issues ?? [])].map(String).filter(Boolean),
  };
}
