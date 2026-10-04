/**
 * B750 — неразобранный JSON автора не роняет проход.
 */
import { safeParseWriterDraft } from "@/lib/seo/page-agent";

describe("safeParseWriterDraft", () => {
  it("возвращает ошибку, а не бросает, когда кавычка внутри строки не экранирована", () => {
    const broken = '{"question": "Что значит "сон" про бывшего?", "summary": "x"}';
    const result = safeParseWriterDraft(broken);
    expect(result.draft).toBeNull();
    expect(result.error).toMatch(/JSON|position/i);
  });

  it("ответ без JSON-объекта тоже даёт ошибку", () => {
    expect(safeParseWriterDraft("Извините, не могу").draft).toBeNull();
  });

  it("валидный объект превращается в черновик", () => {
    const ok = JSON.stringify({
      question: "К чему снится бывший муж?",
      summary: "Коротко.",
      metaTitle: "К чему снится бывший муж",
      metaDescription: "Описание",
      body: [{ heading: "Раздел", paragraphs: ["Абзац"] }],
      perspectives: ["a"],
      faqs: [{ question: "Вопрос?", answer: "Ответ." }],
    });
    const result = safeParseWriterDraft(ok);
    expect(result.error).toBeNull();
    expect(result.draft?.question).toBe("К чему снится бывший муж?");
  });
});

import { safeParseEditorVerdict } from "@/lib/seo/page-agent";

describe("safeParseEditorVerdict", () => {
  it("обрезанный ответ (finishReason length) даёт ошибку, а не бросает", () => {
    const result = safeParseEditorVerdict('{"verdict": "APPR');
    expect(result.verdict).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("ответ без JSON даёт ошибку", () => {
    expect(safeParseEditorVerdict("Думаю, текст хороший.").verdict).toBeNull();
  });
});
