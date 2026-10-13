import {
  chosenHookTask, HOOK_INTENTS, HOOK_RUBRIC, hookPoolApplies, hookStrongCount, hookTotal, parseHookPool,
  parseHookScores, pickHook, type HookCandidate,
} from "@/lib/marketing/threads-hook-pool";
import { chooseThreadsHook, type HookComplete } from "@/lib/marketing/threads-hook-select";

const NOW = new Date("2026-10-14T10:00:00Z");
const hooks = (n: number) => Array.from({ length: n }, (_, i) => ({
  text: `Зачин номер ${i} про вечер`,
  intent: HOOK_INTENTS[i % HOOK_INTENTS.length].code,
}));

describe("B777: пул хуков", () => {
  it("рубрика — 22 балла: 5+4+4+4+5", () => {
    expect(HOOK_RUBRIC.reduce((sum, element) => sum + element.max, 0)).toBe(22);
    expect(HOOK_INTENTS).toHaveLength(7);
  });

  it("разбор пула: неизвестное намерение, слишком короткое, дубль и зачин ленты отбрасываются", () => {
    const raw = JSON.stringify({ hooks: [
      ...hooks(6),
      { text: "Зачин номер 0 про вечер", intent: "pain" },
      { text: "Коротко", intent: "pain" },
      { text: "Нормальный зачин, но намерение странное", intent: "magic" },
      { text: "Раки, ало, у вас сегодня день", intent: "action" },
    ] });
    const recent = [{ text: "Раки, ало, всё будет", at: new Date("2026-10-10T10:00:00Z") }];
    const pool = parseHookPool(`текст до ${raw} текст после`, { recent, now: NOW });
    expect(pool.map((hook) => hook.text)).not.toContain("Раки, ало, у вас сегодня день");
    expect(pool).toHaveLength(6);
  });

  it("меньше четырёх годных хуков — ошибка разбора (перебор моделей возьмёт следующую)", () => {
    expect(() => parseHookPool(JSON.stringify({ hooks: hooks(3) }), { recent: [], now: NOW })).toThrow(/usable hooks/);
    expect(() => parseHookPool("не json", { recent: [], now: NOW })).toThrow();
  });

  it("не больше десяти хуков", () => {
    const pool = parseHookPool(JSON.stringify({ hooks: hooks(14) }), { recent: [], now: NOW });
    expect(pool).toHaveLength(10);
  });

  it("разбор оценок: значения обрезаются по максимуму, мусор — нули", () => {
    const scores = parseHookScores(JSON.stringify({ scores: [
      { i: 0, hook: 9, theme: 4, delivery: -3, value: "x", emotion: 5 },
      { i: 7, hook: 5 },
    ] }), 3);
    expect(scores[0]).toEqual({ hook: 5, theme: 4, delivery: 0, value: 0, emotion: 5 });
    expect(scores[1]).toEqual({ hook: 0, theme: 0, delivery: 0, value: 0, emotion: 0 });
    expect(() => parseHookScores(JSON.stringify({ scores: [] }), 3)).toThrow();
  });

  it("сумма и сильные элементы: сильный — от трёх четвертей максимума", () => {
    const scores = { hook: 4, theme: 3, delivery: 3, value: 2, emotion: 4 };
    expect(hookTotal(scores)).toBe(16);
    expect(hookStrongCount(scores)).toBe(4);
  });

  it("выбор: лучший по сумме; порог ≥9 и ≥3 сильных — признак, не условие отказа", () => {
    const pool: HookCandidate[] = hooks(3);
    const strong = { hook: 5, theme: 4, delivery: 4, value: 1, emotion: 5 };
    const weak = { hook: 1, theme: 1, delivery: 1, value: 1, emotion: 1 };
    expect(pickHook(pool, [weak, strong, weak])).toMatchObject({ text: pool[1].text, passed: true, total: 19, strong: 4, poolSize: 3 });
    const none = pickHook(pool, [weak, weak, { ...weak, hook: 2 }]);
    expect(none.text).toBe(pool[2].text);
    expect(none.passed).toBe(false);
  });

  it("при равной сумме берётся намерение, которого не было в последних постах", () => {
    const pool: HookCandidate[] = [{ text: "Первый зачин про вечер", intent: "pain" }, { text: "Второй зачин про вечер", intent: "action" }];
    const equal = { hook: 3, theme: 3, delivery: 3, value: 3, emotion: 3 };
    expect(pickHook(pool, [equal, equal], ["pain"]).intent).toBe("action");
    expect(pickHook(pool, [equal, equal], []).intent).toBe("pain");
  });

  it("форматы с жёсткой первой строкой пула не получают", () => {
    for (const cluster of ["K1p", "K1", "K2", "K28", "K29", "K30", "K31", "K32"]) expect(hookPoolApplies(cluster)).toBe(false);
    for (const cluster of ["K3", "K14", "K15"]) expect(hookPoolApplies(cluster)).toBe(true);
    expect(hookPoolApplies(undefined)).toBe(false);
  });

  it("два вызова: автор пишет пул, редактор — другая модель — оценивает; выбор кодом", async () => {
    const calls: Array<{ role: string; excludeModel?: string | null }> = [];
    const complete: HookComplete = async ({ role, parse, excludeModel }) => {
      calls.push({ role, excludeModel });
      if (role === "writer") return { value: parse(JSON.stringify({ hooks: hooks(8) })) as never, model: "model-a" };
      const scores = Array.from({ length: 8 }, (_, i) => ({ i, hook: i === 5 ? 5 : 1, theme: i === 5 ? 4 : 1, delivery: 3, value: 2, emotion: i === 5 ? 5 : 1 }));
      return { value: parse(JSON.stringify({ scores })) as never, model: "model-b" };
    };
    const choice = await chooseThreadsHook({
      task: { format: "острый вопрос", construction: null, scene: "ссора", nicheBrief: null, formatRules: null, recentHooks: [], recentIntents: [] },
      recent: [], now: NOW, complete,
    });
    expect(calls).toEqual([{ role: "writer", excludeModel: undefined }, { role: "reviewer", excludeModel: "model-a" }]);
    expect(choice.text).toBe("Зачин номер 5 про вечер");
    expect(chosenHookTask(choice)).toMatchObject({ chosenHook: { text: choice.text, intent: choice.intent } });
  });
});
