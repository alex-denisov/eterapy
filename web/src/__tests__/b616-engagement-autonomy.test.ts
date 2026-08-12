import {
  ENGAGEMENT_DAILY_MINIMUM,
  ENGAGEMENT_PLATFORMS,
  engagementDailyTarget,
  engagementDeficit,
  engagementSessionsFor,
  engagementSlotsFor,
  moscowDateKey,
  openEngagementSlots,
} from "@/lib/marketing/engagement-plan";
import {
  ENGAGEMENT_TONE_HARD_LIMITS,
  engagementToneById,
  engagementTonesFor,
  pickEngagementTone,
} from "@/lib/marketing/engagement-tone";
import { providerProbeDue } from "@/lib/marketing/provider-health";
import { parseCoverageSummary, prioritiseRecrawl } from "@/lib/marketing/seo-coverage";
import {
  MARKETING_SMM_REVIEWER_SYSTEM_PROMPT,
  MARKETING_SMM_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";

const NOON = new Date("2026-07-29T09:00:00.000Z"); // 12:00 MSK

describe("B616 · human-paced engagement plan", () => {
  it("books at least the owner's daily floor on every comment network", () => {
    for (const platform of ENGAGEMENT_PLATFORMS) {
      expect(engagementDailyTarget(platform, NOON)).toBeGreaterThanOrEqual(ENGAGEMENT_DAILY_MINIMUM);
    }
  });

  it("spreads the day across two to four separate visits", () => {
    for (const platform of ENGAGEMENT_PLATFORMS) {
      const sessions = engagementSessionsFor(platform, NOON);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.length).toBeLessThanOrEqual(4);
      for (const session of sessions) {
        expect(session.slots.length).toBeGreaterThanOrEqual(1);
        expect(session.slots.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("is deterministic per day so a restart never re-books the schedule", () => {
    const first = engagementSlotsFor("vk", new Date("2026-07-29T05:00:00.000Z"));
    const second = engagementSlotsFor("vk", new Date("2026-07-29T20:00:00.000Z"));
    expect(second.map((value) => value.toISOString()))
      .toEqual(first.map((value) => value.toISOString()));
  });

  it("gives a different rhythm on a different day", () => {
    const monday = engagementSlotsFor("reddit", new Date("2026-07-29T09:00:00.000Z"));
    const tuesday = engagementSlotsFor("reddit", new Date("2026-07-30T09:00:00.000Z"));
    const shape = (slots: Date[]) => slots.map((slot) => slot.getUTCHours() * 60 + slot.getUTCMinutes());
    expect(shape(monday)).not.toEqual(shape(tuesday));
  });

  it("never places two replies in the same minute", () => {
    for (const platform of ENGAGEMENT_PLATFORMS) {
      const minutes = engagementSlotsFor(platform, NOON)
        .map((slot) => Math.floor(slot.getTime() / 60_000));
      expect(new Set(minutes).size).toBe(minutes.length);
    }
  });

  it("skips slots that are already taken or long past", () => {
    const all = engagementSlotsFor("vk", NOON);
    const open = openEngagementSlots({ platform: "vk", now: NOON, taken: [all[0]] });
    expect(open.map((slot) => slot.toISOString())).not.toContain(all[0].toISOString());
    for (const slot of open) {
      expect(slot.getTime()).toBeGreaterThanOrEqual(NOON.getTime() - 46 * 60_000);
    }
  });

  it("only asks for the replies inside the lookahead window", () => {
    const deficit = engagementDeficit({ platform: "vk", now: NOON, existingToday: [] });
    expect(deficit).toBeGreaterThan(0);
    expect(deficit).toBeLessThanOrEqual(engagementDailyTarget("vk", NOON));
  });

  it("counts a Moscow day, not a UTC day", () => {
    expect(moscowDateKey(new Date("2026-07-29T22:30:00.000Z"))).toBe("2026-07-30");
  });
});

describe("B616 · conversational registers", () => {
  it("offers a real range of voices per platform", () => {
    for (const platform of ENGAGEMENT_PLATFORMS) {
      const tones = engagementTonesFor(platform);
      expect(tones.length).toBeGreaterThanOrEqual(5);
      expect(new Set(tones.map((tone) => tone.id)).size).toBe(tones.length);
    }
  });

  it("allows humour, sarcasm and disagreement somewhere in the mix", () => {
    const ids = ENGAGEMENT_PLATFORMS.flatMap((platform) =>
      engagementTonesFor(platform).map((tone) => tone.id));
    expect(ids).toEqual(expect.arrayContaining(["sarcasm", "dry", "banter", "contrarian"]));
  });

  it("does not repeat the last two registers", () => {
    const tone = pickEngagementTone({
      platform: "threads",
      sequence: 0,
      recentToneIds: ["dry", "sarcasm"],
    });
    expect(["dry", "sarcasm"]).not.toContain(tone.id);
  });

  it("resolves a stored register back to its brief", () => {
    expect(engagementToneById("sarcasm")?.label).toBe("сарказм");
    expect(engagementToneById(null)).toBeNull();
  });

  it("keeps the hard floor about harm rather than politeness", () => {
    const joined = ENGAGEMENT_TONE_HARD_LIMITS.join(" ");
    expect(joined).toContain("не переходи на личность");
    expect(joined).toContain("травлю");
    // Humour is limited by subject, never banned outright.
    expect(joined).toContain("не шути про смерть");
    expect(joined).not.toMatch(/юмор запрещ|без шуток|не используй сарказм/);
  });
});

describe("B616 · prompt contract for replies", () => {
  // B705 заход 6: регистр разговора назначается СОБЕСЕДНИКУ, а не автору
  // поста. Промт разделён по ролям, правило проверяется там, где оно живёт.
  it("hands the assigned register to the writer and forbids inventing one", () => {
    expect(MARKETING_SMM_SYSTEM_PROMPT).toContain("toneHardLimits");
    expect(MARKETING_SMM_SYSTEM_PROMPT).toContain("Разрешены шутка, ирония, сарказм");
    expect(MARKETING_SMM_SYSTEM_PROMPT).toContain("ты не выбираешь его сам");
  });

  it("makes the editor score register fit without punishing humour", () => {
    expect(MARKETING_SMM_REVIEWER_SYSTEM_PROMPT).toContain("toneFit");
    expect(MARKETING_SMM_REVIEWER_SYSTEM_PROMPT).toContain("НЕ являются дефектом");
  });
});

describe("B616 · unattended provider health", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("probes a credential that has never been checked", () => {
    expect(providerProbeDue({
      now,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
    })).toBe(true);
  });

  // Внутри слота, а не «на границе»: в 12:00:00 ровно любая прошлая отметка
  // принадлежит уже прошедшему слоту, и прогон проверял бы не то, что написан.
  const midSlot = new Date("2026-07-29T12:10:00.000Z");

  it("leaves a provider alone inside its own quarter-hour slot", () => {
    // B635, владелец 2026-07-31: шаг у ВСЕХ провайдеров один — пятнадцать
    // минут. Прежняя экономия квоты (час у здорового) стоила дороже, чем
    // экономила: в колонке «проверено» стояла отметка часовой давности, и
    // разные шаги у разных строк выглядели как хаотичная проверка.
    expect(providerProbeDue({
      now: midSlot,
      lastSuccessAt: new Date(midSlot.getTime() - 5 * 60_000),
      lastErrorAt: null,
      lastErrorCode: null,
    })).toBe(false);
    expect(providerProbeDue({
      now: midSlot,
      lastSuccessAt: new Date(midSlot.getTime() - 20 * 60_000),
      lastErrorAt: null,
      lastErrorCode: null,
    })).toBe(true);
  });

  it("retries a transient failure within the hour", () => {
    expect(providerProbeDue({
      now,
      lastSuccessAt: null,
      lastErrorAt: new Date(now.getTime() - 50 * 60_000),
      lastErrorCode: "HEALTHCHECK_FAILED",
    })).toBe(true);
  });

  it("re-checks an account-level block on the same rhythm as everything else", () => {
    // B635: отдельного отступа для решения уровня аккаунта больше нет.
    // Подставленный владельцем новый ключ обязан начать работать без выкатки и
    // без клика — а разный шаг у разных строк и был причиной «хаотично».
    expect(providerProbeDue({
      now: midSlot,
      lastSuccessAt: null,
      lastErrorAt: new Date(midSlot.getTime() - 3 * 60_000),
      lastErrorCode: "INSUFFICIENT_CREDITS",
    })).toBe(false);
    expect(providerProbeDue({
      now: midSlot,
      lastSuccessAt: null,
      lastErrorAt: new Date(midSlot.getTime() - 20 * 60_000),
      lastErrorCode: "INSUFFICIENT_CREDITS",
    })).toBe(true);
  });
});

describe("B470/B550/B578 · index coverage cycle", () => {
  it("spends the recrawl quota on published registry pages first", () => {
    const targets = prioritiseRecrawl({
      sitemap: [
        "https://eterapy.com/library/a",
        "https://eterapy.com/library/b",
        "https://eterapy.com/pricing",
      ],
      registryUrls: ["https://eterapy.com/pricing"],
      recentlySubmitted: [],
      budget: 2,
    });
    expect(targets[0]).toBe("https://eterapy.com/pricing");
    expect(targets).toHaveLength(2);
  });

  it("does not resubmit a URL pushed in the recent window", () => {
    const targets = prioritiseRecrawl({
      sitemap: ["https://eterapy.com/a", "https://eterapy.com/b"],
      registryUrls: [],
      recentlySubmitted: ["https://eterapy.com/a"],
      budget: 10,
    });
    expect(targets).toEqual(["https://eterapy.com/b"]);
  });

  it("stays inside the daily budget", () => {
    const sitemap = Array.from({ length: 200 }, (_, index) => `https://eterapy.com/p${index}`);
    expect(prioritiseRecrawl({
      sitemap,
      registryUrls: [],
      recentlySubmitted: [],
      budget: 40,
    })).toHaveLength(40);
  });
});

describe("B470 · Webmaster summary field names", () => {
  it("reads the documented *_count fields", () => {
    expect(parseCoverageSummary({
      sqi: 0,
      searchable_pages_count: 1,
      excluded_pages_count: 0,
    })).toEqual({ searchablePages: 1, excludedPages: 0 });
  });

  it("still understands the short aliases", () => {
    expect(parseCoverageSummary({ searchable_pages: 12, excluded_pages: 3 }))
      .toEqual({ searchablePages: 12, excludedPages: 3 });
  });

  it("treats a missing field as zero rather than NaN", () => {
    expect(parseCoverageSummary({})).toEqual({ searchablePages: 0, excludedPages: 0 });
  });
});
