/**
 * B762 — пул живых сцен для Threads: разведчик раз в двое суток, сцена
 * отдаётся одному посту и больше не выдаётся.
 */

import { mergeScenes, parsePool, scoutDue, takeScene, scoutPrompt, THREADS_SCOUT_PERIOD_MS } from "@/lib/marketing/threads-material";

const NOW = new Date("2026-10-12T12:00:00Z");
const scene = (text: string) => ({ scene: text, reaction: "посмеяться", why: "узнают себя" });

describe("B762 — пул сцен", () => {
  it("пустой или битый пул читается как пустой и требует разведки", () => {
    expect(parsePool(null)).toEqual({ scoutedAt: null, scenes: [] });
    expect(parsePool("{oops")).toEqual({ scoutedAt: null, scenes: [] });
    expect(scoutDue(parsePool(null), NOW)).toBe(true);
  });

  it("разведка раз в двое суток", () => {
    const pool = { scoutedAt: new Date(NOW.getTime() - THREADS_SCOUT_PERIOD_MS + 60_000).toISOString(), scenes: [] };
    expect(scoutDue(pool, NOW)).toBe(false);
    expect(scoutDue(pool, new Date(NOW.getTime() + 60_000))).toBe(true);
  });

  it("дубли сцен не попадают в пул", () => {
    const first = mergeScenes({ scoutedAt: null, scenes: [] }, [scene("Бывший лайкнул фото в 2 ночи и убрал лайк")], NOW);
    const second = mergeScenes(first, [scene("бывший лайкнул фото в 2 ночи, и убрал лайк!"), scene("Курьер звонит, когда ты в душе")], NOW);
    expect(second.scenes).toHaveLength(2);
  });

  it("сцена выдаётся один раз; тот же пост получает ту же сцену повторно", () => {
    const pool = mergeScenes({ scoutedAt: null, scenes: [] }, [scene("Сцена А про подругу"), scene("Сцена Б про начальницу")], NOW);
    const first = takeScene(pool, "pub-1", NOW);
    expect(first.claimed).toBe(true);
    const again = takeScene(first.pool, "pub-1", NOW);
    expect(again.scene?.id).toBe(first.scene?.id);
    expect(again.claimed).toBe(false);
    const second = takeScene(first.pool, "pub-2", NOW);
    expect(second.scene?.id).not.toBe(first.scene?.id);
    const third = takeScene(second.pool, "pub-3", NOW);
    expect(third.scene).toBeNull();
  });

  it("сцена старше недели не выдаётся", () => {
    const old = mergeScenes({ scoutedAt: null, scenes: [] }, [scene("Старая сцена про бывшего")], new Date(NOW.getTime() - 8 * 86_400_000));
    expect(takeScene(old, "pub-1", NOW).scene).toBeNull();
  });

  it("промт разведчика запрещает цитировать чужие посты и требует сцену, а не тему", () => {
    const prompt = scoutPrompt(["пост 1", "пост 2"]);
    expect(prompt).toMatch(/Не цитируй/);
    expect(prompt).toMatch(/сцена, хорошо/);
  });
});
