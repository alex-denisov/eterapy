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
  it("keeps a complete, dated fourteen-day plan at the requested cadence", () => {
    const plan = contentPlanFor(new Date("2026-07-28T12:00:00.000Z"));
    const counts = plan.reduce<Record<string, number>>((result, entry) => {
      result[entry.channel] = (result[entry.channel] ?? 0) + 1;
      return result;
    }, {});
    const dates = new Set(plan.map((entry) => entry.scheduledAt.slice(0, 10)));

    expect(plan).toHaveLength(96);
    expect(dates.size).toBe(14);
    expect(counts).toEqual({
      telegram: 42,
      threads: 28,
      instagram: 8,
      vk: 10,
      dzen: 6,
      reddit: 2,
    });
    expect(plan.every((entry) => Number.isFinite(plannedAtFor(entry).getTime()))).toBe(true);
    expect(new Set(plan.map((entry) => entry.key)).size).toBe(plan.length);
  });

  it("ships the same initial calendar that the rolling generator creates", () => {
    expect(contentPlanFor(new Date("2026-07-28T12:00:00.000Z"))).toEqual(CONTENT_PLAN);
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
