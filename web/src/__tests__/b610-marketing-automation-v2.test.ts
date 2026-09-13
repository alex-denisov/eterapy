import { AIProvider } from "@prisma/client";
import {
  CONTENT_PLAN,
  contentPlanFor,
  plannedAtFor,
} from "@/lib/marketing/content-plan";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_MODEL_RELEASE_CUTOFF,
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  MARKETING_WRITER_MODEL_PREFERENCES,
  marketingModelFreshness,
} from "@/lib/marketing/model-pool";
import { MARKETING_PLATFORM_FIELDS } from "@/lib/marketing/platform-settings";

describe("B610 · rolling marketing automation", () => {
  // B705 §7: план перестал быть общим двухнедельным окном. Горизонт —
  // свойство ленты (неделя быстрым, две Дзену), а темп считается от
  // календарных суток, а не от позиции дня в скользящем окне.
  it("keeps a dated plan at the per-channel horizon and cadence", () => {
    const plan = contentPlanFor(new Date("2026-07-28T12:00:00.000Z"));
    const counts = plan.reduce<Record<string, number>>((result, entry) => {
      result[entry.channel] = (result[entry.channel] ?? 0) + 1;
      return result;
    }, {});
    const dates = new Set(plan.map((entry) => entry.scheduledAt.slice(0, 10)));

    // B713: у Telegram три слота в сутки вместо двух — вечерний вернулся в
    // план вслед за окнами публикации, отсюда 54 → 61 и 14 → 21 у telegram.
    // B733: у Threads расписание перестало быть ровным (каждые третьи сутки —
    // один пост вместо двух), отсюда 61 → 59 и 14 → 12 у threads.
    // B742: Reddit удалён из площадок целиком — план лишился двух его слотов
    // за две недели (выходил дважды за 21 день), поэтому 59 → 57.
    expect(plan).toHaveLength(57);
    // B742: Reddit удалён, и окно плана сузилось до самого дальнего из
    // оставшихся горизонтов — четырнадцати суток Дзена. Пятнадцатая дата была
    // его и ушла вместе с ним.
    expect(dates.size).toBe(14);
    expect(counts).toEqual({
      telegram: 21,
      threads: 12,
      instagram: 3,
      vk: 7,
      dzen: 14,
    });
    expect(plan.every((entry) => Number.isFinite(plannedAtFor(entry).getTime()))).toBe(true);
    expect(new Set(plan.map((entry) => entry.key)).size).toBe(plan.length);
  });

  it("ships the initial calendar as a subset of the rolling window", () => {
    // `CONTENT_PLAN` — начальный календарь тех же четырнадцати суток. Скользящее
    // окно совпадает с ним по горизонту (B742: самый дальний горизонт — две
    // недели Дзена), но пересчитывается от текущих суток. Общая часть обязана
    // совпадать ключ в ключ, иначе строки реестра, заведённые по начальному
    // календарю, потеряли бы свой слот.
    const rolling = contentPlanFor(new Date("2026-07-28T12:00:00.000Z"));
    const rollingKeys = new Set(rolling.map((entry) => entry.key));
    const shared = CONTENT_PLAN.filter((entry) => rollingKeys.has(entry.key));
    expect(shared.length).toBe(CONTENT_PLAN.length);
    for (const entry of shared) {
      expect(rolling.find((slot) => slot.key === entry.key)).toMatchObject({
        channel: entry.channel,
        scheduledAt: entry.scheduledAt,
        reserve: entry.reserve,
      });
    }
  });

  it("pins every autonomous provider to an approved fresh model", () => {
    for (const provider of MARKETING_ACTIVE_PROVIDERS) {
      const writer = MARKETING_WRITER_MODEL_PREFERENCES[provider];
      const reviewer = MARKETING_REVIEWER_MODEL_PREFERENCES[provider];
      expect(writer).toBeTruthy();
      expect(reviewer).toBeTruthy();
      expect(marketingModelFreshness(writer!).eligible).toBe(true);
      expect(marketingModelFreshness(reviewer!).eligible).toBe(true);
    }
    expect(MARKETING_ACTIVE_PROVIDERS).not.toContain(AIProvider.YANDEX);
    expect(MARKETING_MODEL_RELEASE_CUTOFF).toBe("2026-02-28");
  });

  // B637: пользовательского токена VK больше нет — владелец 2026-07-31 отказался
  // от поиска упоминаний бренда, а других применений у него не было.
  it("treats VK community token as a secret and no longer asks for a user token", () => {
    const vkTokens = MARKETING_PLATFORM_FIELDS.filter(
      (field) => field.platform === "VK" && field.secret,
    );

    expect(vkTokens.map((field) => field.key)).toContain("VK_COMMUNITY_TOKEN");
    expect(MARKETING_PLATFORM_FIELDS.map((field) => field.key)).not.toContain("VK_USER_TOKEN");
    expect(vkTokens.every((field) => field.secret)).toBe(true);
  });
});
