/**
 * B706, B705, B700, B702, B718 — Playbook UI, Canonical Profiles, Dynamic Contracts & Conveyor Enrichment.
 */

import { PLATFORM_PROFILES, platformProfile } from "@/lib/marketing/platform-profiles";
import {
  platformContract,
  platformContractForPrompt,
} from "@/lib/marketing/platform-playbook";
import {
  parsePlaybookOverride,
} from "@/lib/marketing/playbook-settings";
import {
  platformPublishLimits,
  platformLimitsForPrompt,
} from "@/lib/marketing/platform-limits";
import {
  CONTENT_PLAN,
  defaultSlotOutline,
  defaultSlotKeyPoints,
} from "@/lib/marketing/content-plan";
import { repairPublishableDraft } from "@/lib/marketing/agent";

describe("B705: Canonical Platform Profiles", () => {
  const platforms = ["telegram", "instagram", "threads", "vk", "max", "dzen", "reddit"] as const;

  test("defines canonical profiles for all 7 platforms", () => {
    for (const p of platforms) {
      const profile = platformProfile(p);
      expect(profile).toBeDefined();
      expect(profile.platform).toBe(p);
      expect(profile.displayName).toBeTruthy();
      expect(profile.handleOrChannel).toBeTruthy();
      expect(profile.bio.length).toBeGreaterThan(15);
      expect(profile.targetLink).toMatch(/^https?:\/\//);
      expect(profile.guidelines.length).toBeGreaterThan(0);
    }
  });

  test("contains Anya persona details in profiles", () => {
    const tg = PLATFORM_PROFILES.telegram;
    expect(tg.bio).toContain("Аня");
    expect(tg.bio.toLowerCase()).toContain("eterapy");

    const threads = PLATFORM_PROFILES.threads;
    expect(threads.bio).toContain("Аня");
  });
});

describe("B706: Dynamic Playbook Contract Overrides", () => {
  test("parsePlaybookOverride validates bounds and types", () => {
    const invalidMinMax = parsePlaybookOverride(
      "telegram",
      JSON.stringify({
        minCharacters: 2000,
        maxCharacters: 1000,
      }),
    );
    expect(invalidMinMax.rejected.length).toBeGreaterThan(0);
    expect(invalidMinMax.rejected[0].reason).toContain("пара откачена");

    const valid = parsePlaybookOverride(
      "telegram",
      JSON.stringify({
        minCharacters: 300,
        maxCharacters: 800,
        maxLinks: 1,
        ctaPolicy: "required",
      }),
    );
    expect(valid.overridden).toContain("minCharacters");
    expect(valid.contract.minCharacters).toBe(300);
    expect(valid.contract.maxCharacters).toBe(800);
    expect(valid.contract.maxLinks).toBe(1);
    expect(valid.contract.ctaPolicy).toBe("required");
  });

  test("platformPublishLimits respects overrideContract", () => {
    const baseLimits = platformPublishLimits("threads");
    expect(baseLimits.textLimit).toBe(480);

    const overriddenLimits = platformPublishLimits("threads", {
      ...platformContract("threads"),
      maxCharacters: 400,
      minCharacters: 100,
    });
    expect(overriddenLimits.textLimit).toBe(400);
  });

  test("platformLimitsForPrompt formats overridden limits correctly", () => {
    const promptLimits = platformLimitsForPrompt("threads", {
      ...platformContract("threads"),
      minCharacters: 150,
      maxCharacters: 420,
    });
    expect(promptLimits.maxCharacters).toBe(420);
    expect(promptLimits.platform).toBe("threads");
  });

  test("platformContractForPrompt renders prompt instructions with overrides", () => {
    const baseContract = platformContract("vk");
    const promptWithoutOverride = platformContractForPrompt("vk");
    expect(promptWithoutOverride.characters.min).toBe(baseContract.minCharacters);
    expect(promptWithoutOverride.characters.max).toBe(baseContract.maxCharacters);

    const promptWithOverride = platformContractForPrompt("vk", {
      ...baseContract,
      minCharacters: 555,
      maxCharacters: 1555,
      maxLinks: 0,
      ctaPolicy: "discouraged",
    });
    expect(promptWithOverride.characters.min).toBe(555);
    expect(promptWithOverride.characters.max).toBe(1555);
    expect(promptWithOverride.links.max).toBe(0);
    expect(promptWithOverride.cta.policy).toBe("discouraged");
  });

  test("repairPublishableDraft trims text and logs repair when dynamic maxCharacters is tightened", () => {
    const baseContract = platformContract("telegram");
    // Generate draft of 600 chars
    const draftText = "А".repeat(600);
    const draft = {
      title: "Заголовок",
      text: draftText,
      mediaBrief: "Минималистичная иллюстрация",
    };

    // Without override (telegram default maxCharacters is 4096), 600 chars is valid and not trimmed
    const normalRepaired = repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: "https://eterapy.com",
      platform: "telegram",
      topic: "Тема",
      contract: baseContract,
    });
    const normalLengthRepair = normalRepaired.repairs.find((r) => r.field === "length");
    expect(normalLengthRepair).toBeUndefined();
    expect(normalRepaired.draft.text.length).toBeGreaterThanOrEqual(600);

    // With override maxCharacters: 500, 600 chars triggers deterministic trimToLimit
    const strictRepaired = repairPublishableDraft({
      draft,
      isConversational: false,
      destinationUrl: "https://eterapy.com",
      platform: "telegram",
      topic: "Тема",
      contract: {
        ...baseContract,
        maxCharacters: 500,
      },
    });
    const strictLengthRepair = strictRepaired.repairs.find((r) => r.field === "length");
    expect(strictLengthRepair).toBeDefined();
    expect(strictLengthRepair?.note).toContain("500");
    expect(strictRepaired.draft.text.length).toBeLessThanOrEqual(500);
  });
});

describe("B700 phases 9–10: Structured slot briefs and key points", () => {
  test("defaultSlotOutline returns 3 structured steps based on format", () => {
    const dialogueOutline = defaultSlotOutline("расставание", "разбор переписки");
    expect(dialogueOutline.length).toBe(3);
    expect(dialogueOutline[0]).toContain("Цитата или фрагмент");

    const qaOutline = defaultSlotOutline("самооценка", "вопрос-ответ");
    expect(qaOutline.length).toBe(3);
    expect(qaOutline[0]).toContain("Острый жизненный вопрос");

    const standardOutline = defaultSlotOutline("тревога", "пост-рефлексия");
    expect(standardOutline.length).toBe(3);
    expect(standardOutline[0]).toContain("Жизненная точка напряжения");
  });

  test("defaultSlotKeyPoints incorporates query and persona focus", () => {
    const keyPoints = defaultSlotKeyPoints("расставание", "вернется ли бывший");
    expect(keyPoints.length).toBe(3);
    expect(keyPoints[0]).toContain("вернется ли бывший");
    expect(keyPoints[1]).toContain("куратора");
  });

  test("CONTENT_PLAN slots have outline and keyPoints populated", () => {
    expect(CONTENT_PLAN.length).toBeGreaterThan(0);
    const sampleSlot = CONTENT_PLAN[0];
    expect(sampleSlot.outline).toBeDefined();
    expect(sampleSlot.outline?.length).toBe(3);
    expect(sampleSlot.keyPoints).toBeDefined();
    expect(sampleSlot.keyPoints?.length).toBe(3);
  });
});
