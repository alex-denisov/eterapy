/**
 * B718 — экономика конвейера: три числа, каждое из которых замер прода назвал
 * причиной расхода.
 *
 * Прогон меряет НАМЕРЕНИЕ, а не реализацию: он падает ровно тогда, когда
 * кто-нибудь вернёт лестницу потолка или второй круг правки, — то есть когда
 * вернётся дефект, а не когда изменится код вокруг.
 */
import {
  MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS,
  MARKETING_REVIEWER_MAX_TOKENS,
  MARKETING_WRITER_MAX_TOKENS,
  marketingEditorialRoundLimits,
} from "@/lib/marketing/agent";
import { publishWindow } from "@/lib/marketing/publish-windows";

describe("B718 · экономика конвейера", () => {
  it("лестницы потолка вывода больше нет: старт равен потолку", () => {
    // Замер 48 часов: 167 обрывов `output-truncated`, из них ~135 у редактора
    // на ступенях 8000 → 14000 → 16000. Каждая ступень — новый вызов с полным
    // промтом. Потолок не резервируется, поэтому старт ниже него не экономил
    // ничего и стоил двух лишних вызовов.
    expect(MARKETING_REVIEWER_MAX_TOKENS).toBe(MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS);
    expect(MARKETING_WRITER_MAX_TOKENS).toBe(MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS);
  });

  it("второй круг правки не оплачивается", () => {
    // 623 успешные рецензии за неделю на 14 выпущенных материалов — 44 на пост.
    // С B713 исчерпанный круг выпускает лучший черновик, поэтому сокращение
    // кругов означает более ранний выпуск, а не больше смертей.
    const limits = marketingEditorialRoundLimits();
    expect(limits.lifetime).toBe(limits.perPass);
  });

  it("джиттер есть, повторяем и не дотягивается до соседнего слота", () => {
    const morning = publishWindow({
      platform: "telegram",
      contentClass: "card",
      weekday: 3,
      jitterSeed: "telegram:2026-08-24",
    });
    const again = publishWindow({
      platform: "telegram",
      contentClass: "card",
      weekday: 3,
      jitterSeed: "telegram:2026-08-24",
    });
    expect(morning?.time).toBe(again?.time);

    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    // Ближайший сосед у Telegram — 13:00. Даже на краю размаха между ними
    // остаётся больше трёх часов.
    expect(minutes(morning!.time)).toBeLessThan(minutes("13:00") - 180);

    // Без зерна таблица отдаёт свой литеральный час: прогон B700 продолжает
    // мерить таблицу, а не джиттер.
    expect(publishWindow({ platform: "telegram", contentClass: "card", weekday: 3 })?.time).toBe("08:30");
  });

  it("разные сутки одной площадки получают разное время", () => {
    const times = new Set(
      Array.from({ length: 7 }, (_, index) => publishWindow({
        platform: "telegram",
        contentClass: "card",
        weekday: 3,
        jitterSeed: `telegram:2026-08-1${index}`,
      })?.time),
    );
    expect(times.size).toBeGreaterThan(3);
  });
});
