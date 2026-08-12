/**
 * B700 фаза 4 — окно выпуска это функция (класс, площадка, аудитория, день недели).
 *
 * ЧТО БЫЛО. `content-plan.ts` держал часы литералами внутри `buildPlan`:
 * telegram `["08:30","13:00","20:30"][sequence]`, vk — `sequence % 2` между
 * `11:30` и `19:15`, dzen `09:30` — одинаково в понедельник и в воскресенье.
 * Класс материала при этом выбирался ПОЗИЦИЕЙ в ротации, то есть первичным
 * было время, а материал производным. Требование владельца (2026-08-09):
 * «окна публикации должны зависеть от типа/класса/категории контента, от
 * характера площадки и аудитории, от времени суток и от дня недели».
 *
 * ЧТО ПРОВЕРЯЕТСЯ ЗДЕСЬ, кроме самой функции: что замена механизма НЕ стала
 * молчаливой заменой расписания. На будний день таблица обязана отдавать ровно
 * те же часы, что стояли литералами; двинулись только выходные — там, где
 * ритм аудитории действительно другой. Иначе один эффект нечем отделить от
 * другого при замере.
 */
import { contentPlanFor } from "@/lib/marketing/content-plan";
import { publishWindow, slotToleranceMsFor } from "@/lib/marketing/publish-windows";
import { SLOT_WINDOW_MS, isSlotWindowOpen, slotToleranceMs } from "@/lib/marketing/slot-window";

/** Среда, 2026-08-12 — будний день. Воскресенье, 2026-08-16 — выходной. */
const WEDNESDAY = 3;
const SUNDAY = 0;

function timeOf(input: Parameters<typeof publishWindow>[0]) {
  return publishWindow(input)?.time ?? null;
}

describe("B700 фаза 4 · окно выводится из класса и площадки", () => {
  it("будний день отдаёт ровно прежние часы плана", () => {
    expect(timeOf({ platform: "telegram", contentClass: "card", weekday: WEDNESDAY })).toBe("08:30");
    expect(timeOf({ platform: "telegram", contentClass: "practice", weekday: WEDNESDAY })).toBe("13:00");
    expect(timeOf({ platform: "telegram", contentClass: "story", weekday: WEDNESDAY })).toBe("20:30");
    expect(timeOf({ platform: "threads", contentClass: "card", weekday: WEDNESDAY })).toBe("10:45");
    expect(timeOf({ platform: "threads", contentClass: "discussion", weekday: WEDNESDAY })).toBe("18:45");
    expect(timeOf({ platform: "vk", contentClass: "explainer", weekday: WEDNESDAY })).toBe("11:30");
    expect(timeOf({ platform: "vk", contentClass: "discussion", weekday: WEDNESDAY })).toBe("19:15");
    expect(timeOf({ platform: "instagram", contentClass: "card", weekday: WEDNESDAY })).toBe("12:15");
    expect(timeOf({ platform: "dzen", contentClass: "article", weekday: WEDNESDAY })).toBe("09:30");
    expect(timeOf({ platform: "reddit", contentClass: "discussion", weekday: WEDNESDAY })).toBe("17:00");
  });

  it("выходной ≠ будни: у одного и того же класса другой час", () => {
    expect(timeOf({ platform: "telegram", contentClass: "card", weekday: SUNDAY })).toBe("10:00");
    expect(timeOf({ platform: "dzen", contentClass: "article", weekday: SUNDAY })).toBe("10:30");
    // Вечер выходного начинается дома, а не после дороги с работы, — раньше.
    expect(timeOf({ platform: "vk", contentClass: "discussion", weekday: SUNDAY })).toBe("18:00");
  });

  it("класс определяет окно: на одной площадке два класса расходятся по времени суток", () => {
    const explainer = publishWindow({ platform: "vk", contentClass: "explainer", weekday: WEDNESDAY });
    const discussion = publishWindow({ platform: "vk", contentClass: "discussion", weekday: WEDNESDAY });
    expect(explainer?.daypart).toBe("midday");
    expect(discussion?.daypart).toBe("evening");
  });

  it("площадка без нужного времени суток уступает соседнее, а не теряет слот", () => {
    // У Threads нет утра — карточка идёт в дневное окно, а не выпадает из плана.
    const card = publishWindow({ platform: "threads", contentClass: "card", weekday: WEDNESDAY });
    expect(card).not.toBeNull();
    expect(card?.daypart).toBe("midday");
  });

  it("занятое время суток не занимается дважды", () => {
    const second = publishWindow({
      platform: "telegram",
      contentClass: "card",
      weekday: WEDNESDAY,
      taken: ["morning"],
    });
    expect(second?.daypart).toBe("midday");
    expect(second?.time).toBe("13:00");
  });

  it("свободного времени суток не осталось — слот не создаётся молча в тот же час", () => {
    expect(publishWindow({
      platform: "dzen",
      contentClass: "article",
      weekday: WEDNESDAY,
      taken: ["morning", "midday"],
    })).toBeNull();
  });

  it("ширина окна зависит от класса: статья ждёт дольше карточки", () => {
    expect(slotToleranceMsFor("article")).toBeGreaterThan(slotToleranceMsFor("card"));
    expect(slotToleranceMsFor("card")).toBe(SLOT_WINDOW_MS);
  });
});

describe("B700 фаза 4 · план собирается из окон", () => {
  const plan = contentPlanFor(new Date("2026-08-11T09:00:00Z"));

  it("ни один слот не потерян при переходе на функцию окна", () => {
    // B705 §7: горизонт стал свойством ленты, а темп считается от календарных
    // суток. 7 дней × (2 telegram + 2 threads + 1 vk) + instagram через сутки
    // + 14 дней Дзена + Reddit раз в две недели.
    // Проверяется не число, а то, что окно нашлось КАЖДОМУ слоту: пропуск в
    // `publishWindow` молча уронил бы слот из плана.
    const expected = plan.filter((entry) => entry.daypart && entry.toleranceMs > 0).length;
    expect(plan.length).toBe(expected);
    expect(plan.length).toBe(54);
  });

  it("у каждого слота есть класс, время суток и своя ширина окна", () => {
    for (const slot of plan) {
      expect(slot.contentClass).toBeTruthy();
      expect(slot.daypart).toBeTruthy();
      expect(slot.toleranceMs).toBeGreaterThan(0);
      expect(slot.toleranceMs).toBe(slotToleranceMsFor(slot.contentClass));
    }
  });

  it("окно слота не дотягивается до следующего слота той же площадки", () => {
    const byChannel = new Map<string, { at: number; ends: number; key: string }[]>();
    for (const slot of plan) {
      const at = new Date(slot.scheduledAt).getTime();
      const list = byChannel.get(slot.channel) ?? [];
      list.push({ at, ends: at + slot.toleranceMs, key: slot.key });
      byChannel.set(slot.channel, list);
    }
    for (const list of byChannel.values()) {
      const sorted = [...list].sort((left, right) => left.at - right.at);
      for (let index = 1; index < sorted.length; index++) {
        expect(sorted[index - 1].ends).toBeLessThanOrEqual(sorted[index].at);
      }
    }
  });

  it("выходные слоты сдвинуты, будние — нет", () => {
    const telegramMorning = plan.filter((slot) => slot.channel === "telegram" && slot.daypart === "morning");
    const hours = new Map<string, string>();
    for (const slot of telegramMorning) {
      const at = new Date(slot.scheduledAt);
      const moscow = new Date(at.getTime() + 3 * 3_600_000);
      const weekday = moscow.getUTCDay();
      const time = slot.scheduledAt.slice(11, 16);
      hours.set(weekday === 0 || weekday === 6 ? "weekend" : "weekday", time);
    }
    expect(hours.get("weekday")).toBe("08:30");
    expect(hours.get("weekend")).toBe("10:00");
  });
});

describe("B700 фаза 4 · выпуск читает ширину окна из строки", () => {
  const scheduledFor = new Date("2026-08-12T06:30:00.000Z"); // 09:30 МСК

  it("строка без ширины окна живёт прежние два часа", () => {
    expect(slotToleranceMs(JSON.stringify({ format: "структурированная статья" }))).toBeNull();
    expect(isSlotWindowOpen({
      scheduledFor,
      now: new Date(scheduledFor.getTime() + 3 * 3_600_000),
      toleranceMs: null,
    })).toBe(false);
  });

  it("статья со своей шириной окна ещё не просрочена через три часа", () => {
    const notes = JSON.stringify({ contentClass: "article", toleranceMs: slotToleranceMsFor("article") });
    expect(slotToleranceMs(notes)).toBe(6 * 3_600_000);
    expect(isSlotWindowOpen({
      scheduledFor,
      now: new Date(scheduledFor.getTime() + 3 * 3_600_000),
      toleranceMs: slotToleranceMs(notes),
    })).toBe(true);
    expect(isSlotWindowOpen({
      scheduledFor,
      now: new Date(scheduledFor.getTime() + 7 * 3_600_000),
      toleranceMs: slotToleranceMs(notes),
    })).toBe(false);
  });

  it("испорченные notes не расширяют окно молча", () => {
    expect(slotToleranceMs("не json")).toBeNull();
    expect(slotToleranceMs(JSON.stringify({ toleranceMs: -1 }))).toBeNull();
    expect(slotToleranceMs(JSON.stringify({ toleranceMs: "6h" }))).toBeNull();
  });
});
