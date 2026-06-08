import { drawTarotSpread } from "@/lib/symbolic-products";

describe("drawTarotSpread — #12 real tarot cards", () => {
  it("draws exactly 3 distinct cards in Прошлое/Настоящее/Будущее positions", () => {
    const cards = drawTarotSpread("user-1:что меня ждёт в отношениях");
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.position)).toEqual(["Прошлое", "Настоящее", "Будущее"]);
    const names = cards.map((c) => c.name);
    expect(new Set(names).size).toBe(3); // no duplicate cards in one spread
    cards.forEach((c) => {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(typeof c.meaning).toBe("string");
      expect(typeof c.reversed).toBe("boolean");
    });
  });

  it("is deterministic for the same question (stable across re-renders)", () => {
    const a = drawTarotSpread("user-1:одинаковый вопрос");
    const b = drawTarotSpread("user-1:одинаковый вопрос");
    expect(a).toEqual(b);
  });

  it("varies by question", () => {
    const a = drawTarotSpread("user-1:вопрос один").map((c) => c.name).join("|");
    const b = drawTarotSpread("user-1:совсем другой вопрос про работу").map((c) => c.name).join("|");
    expect(a).not.toBe(b);
  });
});
