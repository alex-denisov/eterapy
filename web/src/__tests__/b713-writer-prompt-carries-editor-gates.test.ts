/**
 * B713 §8 — то, по чему редактор отсекает КАЖДЫЙ раз, обязано стоять в промте
 * автора, а не в приговоре редактора.
 *
 * Требование владельца 2026-08-17 дословно: «если у редактора стоят гейты, то
 * нет смысла по ним отсекать каждый раз писателя, если ошибки повторяются,
 * вместо этого есть смысл усилить промт для писателя, чтобы включить все
 * требования, по которым редактор отсекает материалы постоянно».
 *
 * Список требований взят не с потолка: это разбор 37 дословных вердиктов
 * редактора из `archive_reason`/`last_error` за 03.08–17.08. Пять тем дают
 * почти все повторы:
 *
 *   CTA (~20 вхождений) — дублируется, не интегрирован, стоит подписью к
 *     ссылке, не согласован с полем `cta`, отсутствует словами
 *   Длина (~10) — 5240 при лимите 1000, 718 при 480, +48 символов
 *   Ссылка (~8) — стоит там, где контракт её запрещает; дублируется; в начале
 *   mediaBrief (~8) — alt несёт смысл, не совпадает с заголовком, слишком общий
 *   Структура (~6) — двухтактность, длинные абзацы, однотипные подзаголовки
 *
 * ⚠ ЧИСЛА СЮДА НЕ ПЕРЕЕЗЖАЮТ. Лимиты живут в контракте площадки и в
 * `platformLimits` задачи. Второе место, где написано число, немедленно
 * разойдётся с первым — так уже разъехались `platform-limits.ts` и плейбук
 * (B705 §14). Промт называет ПРАВИЛО и отсылает к числу, а не повторяет его.
 */

import { marketingWriterSystemPrompt } from "@/lib/marketing/agent-prompt";

const PLATFORMS = ["telegram", "threads", "vk", "instagram", "dzen"];

describe("B713 — промт автора несёт гейты редактора", () => {
  it.each(PLATFORMS)("%s: правило одного CTA словами", (platform) => {
    const prompt = marketingWriterSystemPrompt(platform);
    expect(prompt).toMatch(/РОВНО ОДИН|ровно один/);
    expect(prompt).toContain("подписью к ссылке");
    // Поле `cta` и призыв в тексте — одно обещание, а не два разных.
    expect(prompt).toContain("совпадать по смыслу");
  });

  it.each(PLATFORMS)("%s: правило ссылки", (platform) => {
    const prompt = marketingWriterSystemPrompt(platform);
    expect(prompt).toContain("ровно один раз");
    expect(prompt).toMatch(/запрещает ссылку|запрещена/);
  });

  it.each(PLATFORMS)("%s: правило mediaBrief", (platform) => {
    const prompt = marketingWriterSystemPrompt(platform);
    expect(prompt).toContain("alt");
    expect(prompt).toContain("не несёт смысловой нагрузки");
  });

  it.each(PLATFORMS)("%s: правило длины со ссылкой на контракт, а не числом", (platform) => {
    const prompt = marketingWriterSystemPrompt(platform);
    expect(prompt).toContain("platformLimits");
    expect(prompt).toContain("посчитай длину");
  });

  it.each(PLATFORMS)("%s: сверка перед ответом перечислена по пунктам", (platform) => {
    const prompt = marketingWriterSystemPrompt(platform);
    expect(prompt).toContain("СВЕРКА ПЕРЕД ОТВЕТОМ");
  });

  it("не вписывает конкретных чисел лимита в общий блок правил", () => {
    const prompt = marketingWriterSystemPrompt("telegram");
    const gates = prompt.slice(prompt.indexOf("СВЕРКА ПЕРЕД ОТВЕТОМ"));
    // 900, 1000, 480 — числа контракта; в блоке правил их быть не должно.
    expect(gates).not.toMatch(/\b(900|1000|480|4096)\b/);
  });

  it("требует вернуть только пост, без размышлений вслух", () => {
    const prompt = marketingWriterSystemPrompt("telegram");
    expect(prompt).toContain("размышлен");
    expect(prompt).toMatch(/<think>/);
  });
});
