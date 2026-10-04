/**
 * B750 — продолжение поста в Threads уходит ЦЕПОЧКОЙ ответов.
 *
 * Живой сбой 2026-10-01/02: «Param text must be at most 500 characters long» —
 * прогноз в 4–6 предложений не помещался в один ответ, отказ глотался
 * `log.warn`, и пост выходил без продолжения.
 */
import { splitThreadsChain, THREADS_TEXT_LIMIT } from "@/lib/marketing/threads-chain";

describe("splitThreadsChain", () => {
  it("короткий текст остаётся одной частью", () => {
    expect(splitThreadsChain("Вам придётся простить себя.")).toEqual(["Вам придётся простить себя."]);
  });

  it("пустой и пробельный текст не даёт частей", () => {
    expect(splitThreadsChain("")).toEqual([]);
    expect(splitThreadsChain("   \n ")).toEqual([]);
  });

  it("длинный текст режется по предложениям, каждая часть в пределах лимита", () => {
    const sentence = "Это предложение нужно, чтобы набрать длину и проверить разрез по границе предложения.";
    const text = Array.from({ length: 12 }, () => sentence).join(" ");
    const parts = splitThreadsChain(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(THREADS_TEXT_LIMIT);
      expect(part).toMatch(/[.!?…]$/);
    }
    expect(parts.join(" ")).toBe(text);
  });

  it("одно предложение длиннее лимита режется по словам, ничего не теряется", () => {
    const text = Array.from({ length: 200 }, (_, i) => `слово${i}`).join(" ");
    const parts = splitThreadsChain(text);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(THREADS_TEXT_LIMIT);
    expect(parts.join(" ")).toBe(text);
  });

  it("точка внутри ссылки и числа не граница предложения", () => {
    const filler = Array.from({ length: 9 }, () => "Ещё одно предложение для длины текста.").join(" ");
    const parts = splitThreadsChain(`${filler} Смотрите https://eterapy.com/forecast и число 3.5 тоже. ${filler}`);
    const joined = parts.join(" ");
    expect(joined).toContain("https://eterapy.com/forecast");
    expect(joined).toContain("3.5");
  });

  it("слово длиннее лимита не теряется", () => {
    const token = "ъ".repeat(1200);
    const parts = splitThreadsChain(`Начало. ${token} Конец.`);
    expect(parts.join("").replace(/[^ъ]/g, "").length).toBe(1200);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(THREADS_TEXT_LIMIT);
  });

  it("абзацы длинного текста сохраняются", () => {
    const para = Array.from({ length: 4 }, () => "Предложение абзаца для набора длины.").join(" ");
    const parts = splitThreadsChain(`${para}\n\n${para}\n\n${para}\n\n${para}`);
    expect(parts.join("\n")).toContain("\n\n");
  });

  it("лимит не больше 500 — предела Threads", () => {
    expect(THREADS_TEXT_LIMIT).toBeLessThanOrEqual(500);
  });
});
