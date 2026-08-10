/**
 * B700 фаза 6 — раунды правки не сходились, и линия выбрасывала поправимое.
 *
 * Замер прода 2026-08-10 за 13 часов после батча 45: десять материалов ушли в
 * архив, и НИ ОДИН не был отклонён редактором — у всех десяти три раунда подряд
 * `REVISE`. Редактор трижды говорит «поправимо» и пишет в итоге дословно
 * «Правки минимальны и не затрагивают смысл», после чего материал
 * выбрасывается по исчерпанию раундов.
 *
 * Замечания при этом не повторяются, а меняются целиком (материал
 * `cms5bej0f001z…`):
 *
 *   раунд 1 — заголовок кандидата не совпадает с заголовком задания
 *   раунд 2 — CTA продублирован, лишняя объяснительная фраза
 *   раунд 3 — заголовок не отражает формат, CTA в тексте ≠ CTA в meta
 *
 * Несходимость структурная, а не капризы модели, и держится она на двух
 * механизмах:
 *
 *   1. автору велено вернуть «полностью готовую НОВУЮ версию» — он и
 *      переписывает всё, снимая прежние замечания вместе с уцелевшим текстом;
 *   2. редактор не видит, что просил сам, — в его запрос уходили только
 *      task/research/candidate, поэтому каждый раунд он проверял материал с
 *      чистого листа и находил свежие придирки.
 *
 * Цена: 10 материалов × 3 раунда × 2 роли = 60 оплаченных вызовов ради нуля
 * выпусков — на той самой ёмкости, дефицит которой чинили фазы 2–3.
 */

import {
  marketingReviewerPrompt,
  marketingWriterPrompt,
} from "@/lib/marketing/agent-prompt";

const task = { platform: "telegram", title: "Низкая совместимость по дате" };
const research = { signals: ["сигнал"] };

const previousDraft = {
  title: "Совместимость по дате — это про цифры",
  text: "Пара, которая прислала этот вопрос…",
  audienceNeed: "",
  goal: "",
  disclosure: "",
  cta: "Назовите одну ситуацию",
  mediaBrief: "",
  researchUsed: [],
  safetyFlags: [],
};

const previousReview = {
  decision: "REVISE" as const,
  scores: {},
  issues: ["Заголовок кандидата не совпадает с заголовком task."],
  revisionBrief: ["Привести заголовок в соответствие с task."],
  revisedText: "",
  summary: "Правки минимальны и не затрагивают смысл.",
};

describe("B700 · автор правит текст, а не пишет его заново", () => {
  it("первый раунд остаётся написанием с нуля", () => {
    const prompt = marketingWriterPrompt({
      task,
      research,
      round: 1,
      previousDraft: null,
      previousReview: null,
    });
    expect(prompt.previousCandidate).toBeUndefined();
    expect(prompt.editorialRound).toBe(1);
  });

  it("раунд правки требует внести исправления, а не вернуть новую версию", () => {
    const prompt = marketingWriterPrompt({
      task,
      research,
      round: 2,
      previousDraft,
      previousReview,
    });
    const instruction = String(prompt.instruction);
    expect(instruction).toMatch(/не переписыв/i);
    // Прежняя формулировка «верни полностью готовую новую версию» и была
    // причиной несходимости — её в задании быть не должно.
    expect(instruction).not.toMatch(/новую версию/i);
  });

  it("правится именно тот текст, который смотрел редактор", () => {
    const prompt = marketingWriterPrompt({
      task,
      research,
      round: 2,
      previousDraft,
      previousReview,
    });
    expect(prompt.previousCandidate).toEqual(previousDraft);
    expect(prompt.editorIssues).toEqual(previousReview.issues);
    expect(prompt.revisionBrief).toEqual(previousReview.revisionBrief);
  });

  it("полная переработка остаётся возможной, но по явному слову редактора", () => {
    const prompt = marketingWriterPrompt({
      task,
      research,
      round: 2,
      previousDraft,
      previousReview,
    });
    expect(String(prompt.instruction)).toMatch(/переработ|заново/i);
  });
});

describe("B700 · редактор помнит, что просил сам", () => {
  it("в первом раунде помнить нечего", () => {
    const prompt = marketingReviewerPrompt({
      task,
      research,
      round: 1,
      candidate: previousDraft,
      systemRepairs: [],
      previousReview: null,
    });
    expect(prompt.previousIssues).toBeUndefined();
    expect(prompt.previousRevisionBrief).toBeUndefined();
  });

  it("во втором раунде видит собственные замечания прошлого раунда", () => {
    const prompt = marketingReviewerPrompt({
      task,
      research,
      round: 2,
      candidate: previousDraft,
      systemRepairs: [],
      previousReview,
    });
    expect(prompt.previousIssues).toEqual(previousReview.issues);
    expect(prompt.previousRevisionBrief).toEqual(previousReview.revisionBrief);
  });

  it("кандидат и служебные доработки остаются на месте", () => {
    const prompt = marketingReviewerPrompt({
      task,
      research,
      round: 2,
      candidate: previousDraft,
      systemRepairs: [{ field: "cta", note: "дописан CTA" }],
      previousReview,
    });
    expect(prompt.candidate).toEqual(previousDraft);
    expect(prompt.systemRepairs).toEqual([{ field: "cta", note: "дописан CTA" }]);
    expect(prompt.editorialRound).toBe(2);
  });
});
