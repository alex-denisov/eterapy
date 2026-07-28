import { AIProvider } from "@prisma/client";
import {
  getDefaultAIRoutingPolicy,
  listDefaultAITaskPolicies,
  mergeAITaskPolicies,
} from "@/lib/ai-gateway/task-policy";

describe("AI task taxonomy and default routing policy", () => {
  it("maps v5 product tasks to free, premium, sensitive, vision, speech, and compliance tiers", () => {
    const policies = listDefaultAITaskPolicies();

    expect(policies.map((policy) => policy.feature)).toEqual(expect.arrayContaining([
      "dialogue-primary-answer",
      "dialogue-router",
      "safety-classification",
      "product-deep-report",
      "product-chat-analysis-ocr",
      "product-chat-analysis",
      "product-outside-questions",
      "product-tarot",
      "product-natal-chart",
      "product-numerology",
      "session-summary",
      "session-compliance",
    ]));
    const tiers = new Set(policies.map((policy) => policy.tier));
    expect(tiers.has("free")).toBe(true);
    expect(tiers.has("premium")).toBe(true);
    expect(tiers.has("sensitive")).toBe(true);
    expect(policies.some((policy) => policy.tier === "vision")).toBe(true);
    expect(policies.some((policy) => policy.tier === "speech")).toBe(true);
    expect(policies.some((policy) => policy.tier === "compliance")).toBe(true);
  });

  it("keeps sensitive, compliance, and OCR defaults inside the Yandex provider family", () => {
    const safety = getDefaultAIRoutingPolicy("safety-classification");
    const compliance = getDefaultAIRoutingPolicy("session-compliance");
    const chatOcr = getDefaultAIRoutingPolicy("product-chat-analysis-ocr");

    expect(safety?.providerOrder).toEqual([AIProvider.YANDEX]);
    expect(compliance?.providerOrder).toEqual([AIProvider.YANDEX]);
    expect(chatOcr?.providerOrder).toEqual([AIProvider.YANDEX]);
    expect(safety?.modelPreferences).toEqual({ [AIProvider.YANDEX]: "yandexgpt/latest" });
    expect(compliance?.fallbackNotes).toContain("human");
    // OCR must route to Yandex Vision OCR (never a text-only LLM model that
    // would silently drop the image), and never persist the image.
    expect(chatOcr?.modelPreferences).toEqual({ [AIProvider.YANDEX]: "yandex-vision-ocr" });
    expect(chatOcr?.fallbackNotes).toContain("Yandex Vision OCR");
    expect(chatOcr?.fallbackNotes).toContain("not persisted");
    // INC-026: the paid, per-use-billed OCR feature has NO per-user daily token cap
    // (a client runs many разборов/day; the cap was misreported as un-recognised
    // screenshots). It matches every other paid feature — none carry one.
    expect(chatOcr?.perUserDailyTokenBudget ?? null).toBeNull();
    // Issue #2/#3: the checkin dialogue flow must ALWAYS be LLM-written — never
    // silently degraded to scripted content when a user (or a founder testing)
    // exhausts a per-user token cap. Abuse is bounded by the 3-разбора/day COUNT
    // limit, so these features carry NO per-user daily token budget.
    for (const feature of ["dialogue-primary-answer", "dialogue-clarifier", "dialogue-router", "safety-classification", "daily-practice"]) {
      expect(getDefaultAIRoutingPolicy(feature)?.perUserDailyTokenBudget ?? null).toBeNull();
    }
    // STT stays capped — it's expensive audio transcription, not the free flow.
    expect((getDefaultAIRoutingPolicy("session-stt")?.perUserDailyTokenBudget ?? 0)).toBeGreaterThan(0);
  });

  it("keeps platform-user tasks on Yandex and isolates public SMM in the free foreign pool", () => {
    const policies = listDefaultAITaskPolicies();

    for (const policy of policies) {
      if (["marketing-agent-writer", "marketing-agent-reviewer"].includes(policy.feature)) {
        expect(policy.providerOrder).not.toContain(AIProvider.YANDEX);
        expect(policy.providerOrder).toEqual(expect.arrayContaining([
          AIProvider.OPENROUTER,
          AIProvider.GEMINI,
          AIProvider.CEREBRAS,
          AIProvider.GROQ,
        ]));
        expect(policy.modelPreferences ?? {}).toEqual({});
        continue;
      }
      expect(policy.providerOrder).toEqual([AIProvider.YANDEX]);
      expect(Object.keys(policy.modelPreferences ?? {})).toEqual([AIProvider.YANDEX]);
    }
    // B554: бесплатный разбор — это текст, который клиент реально читает и по
    // которому решает, возвращаться ли. Он ушёл с Lite на Pro; «free» в тарифе
    // означало модель, а не цену для клиента (бесплатность держит лимит
    // 3 разбора/сутки).
    expect(getDefaultAIRoutingPolicy("dialogue-primary-answer")?.modelPreferences).toEqual({
      [AIProvider.YANDEX]: "yandexgpt/latest",
    });
    expect(getDefaultAIRoutingPolicy("product-deep-report")?.modelPreferences).toEqual({
      [AIProvider.YANDEX]: "yandexgpt/latest",
    });
    expect(getDefaultAIRoutingPolicy("product-chat-analysis-ocr")?.modelPreferences).toEqual({
      [AIProvider.YANDEX]: "yandex-vision-ocr",
    });
    expect(getDefaultAIRoutingPolicy("session-stt")?.modelPreferences).toEqual({
      [AIProvider.YANDEX]: "speechkit-stt-async",
    });
    expect(getDefaultAIRoutingPolicy("session-stt")?.fallbackNotes).toContain("Yandex SpeechKit");
    expect(getDefaultAIRoutingPolicy("product-outside-questions")).toEqual(expect.objectContaining({
      providerOrder: [AIProvider.YANDEX],
      modelPreferences: { [AIProvider.YANDEX]: "yandexgpt-lite/latest" },
      tier: "cheap",
    }));
  });

  it("marks database policies while still showing default taxonomy metadata", () => {
    const merged = mergeAITaskPolicies([
      {
        id: "policy-1",
        feature: "dialogue-primary-answer",
        enabled: false,
        providerOrder: [AIProvider.OPENAI],
        modelPreferences: null,
        maxTokens: 321,
        temperature: 0,
        timeoutMs: 1234,
        dailyTokenBudget: null,
        perUserDailyTokenBudget: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const dialogue = merged.find((policy) => policy.feature === "dialogue-primary-answer");
    expect(dialogue).toEqual(expect.objectContaining({
      source: "database",
      title: "Free первичный разбор",
      enabled: false,
      maxTokens: 321,
      providerOrder: [AIProvider.OPENAI],
    }));
  });
});
