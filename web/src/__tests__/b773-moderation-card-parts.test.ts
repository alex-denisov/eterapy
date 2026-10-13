import { describe, expect, it } from "@jest/globals";
import {
  TELEGRAM_CARD_LIMIT,
  chunkCardMessage,
  replyPartsOf,
  partsBlock,
} from "@/lib/marketing/moderation-card";

describe("B773 карточка утверждения показывает пост целиком", () => {
  it("части поста берутся из replyText в notes и режутся по правилам Threads", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Предложение номер ${i + 1} про границы и тревогу.`).join(" ");
    const parts = replyPartsOf(JSON.stringify({ replyText: long }));
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.join(" ").replace(/\s+/g, " ")).toContain("Предложение номер 12");
  });

  it("без replyText и на битых notes частей нет", () => {
    expect(replyPartsOf(null)).toEqual([]);
    expect(replyPartsOf("не json")).toEqual([]);
    expect(replyPartsOf(JSON.stringify({ replyText: "  " }))).toEqual([]);
  });

  it("блок частей нумерует каждую и называет её ответом на свой пост", () => {
    const block = partsBlock(["Первая часть.", "Вторая часть."]);
    expect(block).toContain("Продолжение 1 из 2");
    expect(block).toContain("Вторая часть.");
    expect(partsBlock([])).toBe("");
  });

  it("экранирует HTML в частях", () => {
    expect(partsBlock(["a < b & c"])).toContain("a &lt; b &amp; c");
  });

  it("короткое сообщение уходит одним куском", () => {
    expect(chunkCardMessage("коротко")).toEqual(["коротко"]);
  });

  it("длинное режется по пустым строкам, ничего не теряет и не превышает лимит Telegram", () => {
    const blocks = Array.from({ length: 30 }, (_, i) => `Блок ${i}: ${"текст ".repeat(120)}`);
    const chunks = chunkCardMessage(blocks.join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= TELEGRAM_CARD_LIMIT)).toBe(true);
    expect(chunks.join("\n\n")).toBe(blocks.join("\n\n"));
  });

  it("один блок длиннее лимита режется по строкам", () => {
    const giant = Array.from({ length: 400 }, (_, i) => `строка ${i} ${"слово ".repeat(5)}`).join("\n");
    const chunks = chunkCardMessage(giant);
    expect(chunks.every((chunk) => chunk.length <= TELEGRAM_CARD_LIMIT)).toBe(true);
    expect(chunks.join("\n")).toBe(giant);
  });
});
