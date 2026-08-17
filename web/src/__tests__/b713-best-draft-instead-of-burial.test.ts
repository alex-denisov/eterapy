/**
 * B713 §3 — исчерпанные круги выпускают лучшее, а не хоронят всё.
 *
 * Замер прода 03.08–17.08 дал 21 смерть с формулировками, где редактор
 * возражал по ОДНОМУ пункту и признавал остальное годным:
 *
 *   «Замечание из предыдущего раунда (превышение лимита на 48 символов) не
 *    устранено. Остальные параметры соответствуют требованиям.»
 *   «Неустранённые дефекты из прошлого раунда … Новых блокирующих замечаний
 *    нет.»
 *
 * Решение владельца 2026-08-17: выпускать лучший черновик, а в канал слать
 * пометку с оставшимися замечаниями.
 */

import {
  pickBestDraft,
  releasableWithoutApproval,
  reviewScore,
} from "@/lib/marketing/best-draft";

function candidate(over: Partial<Parameters<typeof releasableWithoutApproval>[0]> = {}) {
  return {
    round: 1,
    text: "Готовый текст материала достаточной длины для выпуска.",
    scores: { relevance: 4, value: 4 },
    decision: "REVISE",
    safetyFlags: [] as string[],
    issues: [] as string[],
    ...over,
  };
}

describe("B713 — выбор лучшего черновика", () => {
  it("складывает оценки редактора, пропуская нечисловые", () => {
    expect(reviewScore({ relevance: 4, value: 5, cta: "нет" })).toBe(9);
    expect(reviewScore(null)).toBe(0);
    expect(reviewScore(undefined)).toBe(0);
  });

  it("берёт кандидата с наибольшей суммой оценок", () => {
    const best = pickBestDraft([
      candidate({ round: 1, scores: { a: 3, b: 3 }, text: "Первый круг." }),
      candidate({ round: 2, scores: { a: 5, b: 4 }, text: "Второй круг." }),
      candidate({ round: 3, scores: { a: 2, b: 2 }, text: "Третий круг." }),
    ]);
    expect(best?.round).toBe(2);
    expect(best?.score).toBe(9);
  });

  it("при равных оценках выбирает поздний круг — он правился по замечаниям", () => {
    const best = pickBestDraft([
      candidate({ round: 1, scores: { a: 4 } }),
      candidate({ round: 3, scores: { a: 4 } }),
    ]);
    expect(best?.round).toBe(3);
  });

  it("несёт наружу незакрытые замечания", () => {
    const best = pickBestDraft([
      candidate({ round: 2, issues: ["превышение лимита на 48 символов", ""] }),
    ]);
    expect(best?.outstandingIssues).toEqual(["превышение лимита на 48 символов"]);
  });
});

describe("B713 — что НЕ выпускается без одобрения", () => {
  it("приговор REJECT остаётся приговором", () => {
    expect(releasableWithoutApproval(candidate({ decision: "REJECT" }))).toBe(false);
    expect(pickBestDraft([candidate({ decision: "REJECT" })])).toBeNull();
  });

  it("флаг безопасности запрещает выпуск", () => {
    expect(releasableWithoutApproval(candidate({ safetyFlags: ["crisis"] }))).toBe(false);
    expect(pickBestDraft([candidate({ safetyFlags: ["crisis"] })])).toBeNull();
  });

  it("пустой текст выпускать нечем", () => {
    expect(releasableWithoutApproval(candidate({ text: "   " }))).toBe(false);
    expect(pickBestDraft([candidate({ text: "" })])).toBeNull();
  });

  it("годный кандидат находится даже среди отклонённых", () => {
    const best = pickBestDraft([
      candidate({ round: 1, decision: "REJECT", scores: { a: 5, b: 5 } }),
      candidate({ round: 2, decision: "REVISE", scores: { a: 3 }, text: "Годный текст." }),
    ]);
    expect(best?.round).toBe(2);
  });
});
