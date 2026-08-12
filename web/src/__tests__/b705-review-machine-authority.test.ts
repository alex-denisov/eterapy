/**
 * B705 §23 — по считаемым свойствам судья машина, а не редактор.
 *
 * Случай прода 2026-08-12, дословно из `archive_reason` материала
 * `cms5bej59002l0vwk1x54vgs8` (threads, шесть раундов):
 *
 *   «Неустранённые дефекты из прошлого раунда: текст всё ещё длиннее лимита
 *    Threads (718 символов), CTA дублируется»
 *
 * Длины кандидата по раундам были 417, 443, 434, 501, 467, 466 при лимите 480,
 * а число 718 модель взяла из НАШЕЙ же записки о починке прошлого раунда. Из
 * 128 материалов, погибших с 05.08, 26 назвали в последнем замечании лимит или
 * длину.
 *
 * Замечание редактора о длине ложно ПО ПОСТРОЕНИЮ: к нему материал попадает
 * только тогда, когда `violations` пуст, то есть длину машина уже признала
 * годной.
 */

import { repairPublishableDraft } from "@/lib/marketing/agent";
import { reconcileReviewWithMachine } from "@/lib/marketing/review-machine-authority";

const scores = {
  relevance: 5,
  value: 5,
  authenticity: 5,
  safety: 5,
  platformFit: 2,
  completeness: 5,
  language: 5,
  cta: 5,
  visual: 5,
  antiSlop: 5,
};

describe("B705 §23 — считаемое свойство судит машина", () => {
  it("вычёркивает замечание о длине и утверждает материал, если больше сказать нечего", () => {
    const resolved = reconcileReviewWithMachine({
      review: {
        decision: "REVISE",
        scores: { ...scores },
        issues: [
          "Неустранённые дефекты из прошлого раунда: текст всё ещё длиннее лимита Threads (718 символов).",
        ],
        revisionBrief: ["Сократить текст до лимита площадки."],
        revisedText: "",
        summary: "Текст превышает лимит символов.",
      },
      machineDefectRules: [],
    });

    expect(resolved.dropped).toHaveLength(1);
    expect(resolved.review.issues).toHaveLength(0);
    expect(resolved.review.decision).toBe("APPROVE");
    // Оценка, просевшая из-за несуществующего дефекта, не может держать материал.
    expect(resolved.review.scores.platformFit).toBeGreaterThanOrEqual(4);
  });

  it("оставляет замечание по существу и не утверждает материал", () => {
    const resolved = reconcileReviewWithMachine({
      review: {
        decision: "REVISE",
        scores: { ...scores, platformFit: 5, value: 2 },
        issues: [
          "Текст длиннее лимита Threads.",
          "Совет дан в лоб и не опирается ни на один конкретный пример.",
        ],
        revisionBrief: ["Сократить текст.", "Добавить конкретный пример из практики."],
        revisedText: "",
        summary: "Материал не готов.",
      },
      machineDefectRules: [],
    });

    expect(resolved.dropped).toHaveLength(1);
    expect(resolved.review.issues).toEqual([
      "Совет дан в лоб и не опирается ни на один конкретный пример.",
    ]);
    expect(resolved.review.revisionBrief).toEqual(["Добавить конкретный пример из практики."]);
    expect(resolved.review.decision).toBe("REVISE");
  });

  it("не трогает замечание о свойстве, которое машина сама назвала дефектом", () => {
    const resolved = reconcileReviewWithMachine({
      review: {
        decision: "REVISE",
        scores: { ...scores },
        issues: ["Текст длиннее лимита Threads на 40 символов."],
        revisionBrief: ["Сократить текст."],
        revisedText: "",
        summary: "Перебор длины.",
      },
      machineDefectRules: ["length-over"],
    });

    expect(resolved.dropped).toHaveLength(0);
    expect(resolved.review.decision).toBe("REVISE");
  });

  it("REJECT остаётся приговором: смысл машина не судит", () => {
    const resolved = reconcileReviewWithMachine({
      review: {
        decision: "REJECT",
        scores: { ...scores },
        issues: ["Текст длиннее лимита Threads."],
        revisionBrief: [],
        revisedText: "",
        summary: "Вместо поста служебный текст.",
      },
      machineDefectRules: [],
    });

    expect(resolved.review.decision).toBe("REJECT");
  });

  it("не путает «длинный текст без пользы» с перебором лимита", () => {
    const resolved = reconcileReviewWithMachine({
      review: {
        decision: "REVISE",
        scores: { ...scores, platformFit: 5, value: 2 },
        issues: ["Текст длинный и водянистый: три абзаца об одном и том же."],
        revisionBrief: ["Убрать повторы."],
        revisedText: "",
        summary: "Вода.",
      },
      machineDefectRules: [],
    });

    expect(resolved.dropped).toHaveLength(0);
    expect(resolved.review.decision).toBe("REVISE");
  });

  it("вычёркивает счётные придирки к хэштегам, эмодзи и тире", () => {
    const resolved = reconcileReviewWithMachine({
      review: {
        decision: "REVISE",
        scores: { ...scores },
        issues: [
          "Хэштегов больше, чем допускает площадка.",
          "Слишком много эмодзи в тексте.",
          "В тексте есть длинное тире, оно запрещено контрактом.",
        ],
        revisionBrief: ["Убрать хэштеги.", "Убрать эмодзи.", "Заменить тире."],
        revisedText: "",
        summary: "Форма не соответствует площадке.",
      },
      machineDefectRules: [],
    });

    expect(resolved.dropped).toHaveLength(3);
    expect(resolved.review.decision).toBe("APPROVE");
  });
});

/**
 * Второй механизм того же дефекта: записка о починке называла только длину ДО
 * усечения, и редактор следующего раунда читал её как длину сейчас.
 */
describe("B705 §23 — записка о починке описывает состояние после починки", () => {
  it("называет длину сейчас, а не только ту, что была до усечения", () => {
    const repaired = repairPublishableDraft({
      draft: {
        title: "Вернётся ли бывший",
        text: "а".repeat(900),
        audienceNeed: "",
        goal: "",
        disclosure: "",
        cta: "Разобрать спокойно",
        mediaBrief: "тёплая абстракция",
        researchUsed: [],
        safetyFlags: [],
      },
      isConversational: false,
      destinationUrl: "https://eterapy.com/library/vernetsya-li-byvshiy",
      platform: "threads",
      topic: "расставание",
      finalRound: true,
    });

    const note = repaired.repairs.find((repair) => repair.field === "length")?.note ?? "";
    const numbers = note.match(/было (\d+) символов при пределе (\d+), стало (\d+)/u);
    expect(numbers).not.toBeNull();
    const [, before, limit, after] = numbers!.map(Number);
    expect(before).toBeGreaterThan(limit);
    // «Стало» описывает текст, который редактор увидит на самом деле.
    expect(after).toBe(repaired.draft.text.length);
    expect(after).toBeLessThanOrEqual(limit);
    expect(note).toContain("в пределах площадки");
  });
});
