jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import { ownerIdeaSlot, parseOwnerIdeas } from "@/lib/marketing/owner-ideas";

describe("parseOwnerIdeas", () => {
  it("не трогает сообщения без префикса", () => {
    expect(parseOwnerIdeas("сделай что-нибудь про Тельцов")).toBeNull();
  });

  it("одна идея в одном сообщении", () => {
    expect(parseOwnerIdeas("идея: пост-оклик знака Рака с прогнозом на неделю")).toEqual([
      "пост-оклик знака Рака с прогнозом на неделю",
    ]);
  });

  it("список и абзацы дают отдельные идеи, короткие отбрасываются", () => {
    const text = "Идеи:\n1. Пост про Тельцов с вызовом и сроком\n2) Пост про Раков: мягкий оклик\n\nТретья идея через\nпустую строку\n- ок";
    expect(parseOwnerIdeas(text)).toEqual([
      "Пост про Тельцов с вызовом и сроком",
      "Пост про Раков: мягкий оклик",
      "Третья идея через пустую строку",
    ]);
  });
});

describe("ownerIdeaSlot", () => {
  it("внутри окна идёт через 8 минут, затем с шагом", () => {
    const now = new Date("2026-10-11T12:00:00Z"); // 15:00 МСК
    expect(ownerIdeaSlot(now, 0).toISOString()).toBe("2026-10-11T12:08:00.000Z");
    expect(ownerIdeaSlot(now, 1).toISOString()).toBe("2026-10-11T12:33:00.000Z");
  });

  it("ночью переносится на утро окна", () => {
    const now = new Date("2026-10-11T22:00:00Z"); // 01:00 МСК 12-го
    expect(ownerIdeaSlot(now, 0).toISOString()).toBe("2026-10-12T07:00:00.000Z");
  });
});
