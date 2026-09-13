/**
 * B724 — SMM Pipeline Convergence & Inline Fixing.
 *
 * Тесты:
 * 1. text-hygiene: очистка zero-width символов и Unicode Tag маркеров.
 * 2. draft-inspection: calculateWeightedScore (взвешенная сумма >= 35, критические >= 4).
 * 3. agent: approvedByScorecard с субъективными тройками;
 *    приём revisedText и однопроходное авто-исправление.
 * 4. publish: отсутствие is_ai_generated в запросе Instagram Graph API;
 *    очистка скрытых водяных знаков перед публикацией на все площадки.
 */

import {
  approvedByScorecard,
  marketingEditorialRoundLimits,
  reviewerObject,
} from "@/lib/marketing/agent";
import {
  calculateWeightedScore,
} from "@/lib/marketing/draft-inspection";
import {
  hasHiddenMarkers,
  stripHiddenMarkers,
} from "@/lib/marketing/text-hygiene";

describe("B724 · text-hygiene (очистка скрытых маркеров и водяных знаков)", () => {
  it("удаляет zero-width пробелы, BOM и soft hyphen", () => {
    const dirty = "Текст\u200B с\uFEFF невидимыми\u00AD символами";
    expect(hasHiddenMarkers(dirty)).toBe(true);
    const cleaned = stripHiddenMarkers(dirty);
    expect(cleaned).toBe("Текст с невидимыми символами");
    expect(hasHiddenMarkers(cleaned)).toBe(false);
  });

  it("удаляет Unicode Tag символы (U+E0000..U+E007F)", () => {
    const dirty = "Обычный текст\u{E0001}\u{E0020}\u{E007F} с AI водяными знаками";
    expect(hasHiddenMarkers(dirty)).toBe(true);
    const cleaned = stripHiddenMarkers(dirty);
    expect(cleaned).toBe("Обычный текст с AI водяными знаками");
    expect(hasHiddenMarkers(cleaned)).toBe(false);
  });

  it("не изменяет чистый текст, эмодзи и пунктуацию", () => {
    const clean = "Привет! Это пост для Telegram с эмодзи ✨ и обычным дефисом - всё ок.";
    expect(hasHiddenMarkers(clean)).toBe(false);
    expect(stripHiddenMarkers(clean)).toBe(clean);
  });

  it("корректно обрабатывает пустые строки", () => {
    expect(stripHiddenMarkers("")).toBe("");
    expect(hasHiddenMarkers("")).toBe(false);
  });
});

describe("B724 · calculateWeightedScore (взвешенный гейт допуска >=35/50)", () => {
  const perfectScores = {
    relevance: 5,
    value: 5,
    authenticity: 5,
    safety: 5,
    platformFit: 5,
    completeness: 5,
    language: 5,
    cta: 5,
    visual: 5,
    antiSlop: 5,
  };

  it("пропускает пост с идеальным баллом 50/50", () => {
    const res = calculateWeightedScore(perfectScores);
    expect(res.passed).toBe(true);
    expect(res.total).toBe(50);
    expect(res.criticalPassed).toBe(true);
  });

  it("пропускает пост с субъективными тройками (antiSlop: 3, cta: 3, platformFit: 3), если сумма >=35", () => {
    const scoresWithThrees = {
      ...perfectScores,
      antiSlop: 3,
      cta: 3,
      platformFit: 3,
      language: 3,
    }; // Total: 5*6 + 3*4 = 42 >= 35. Критические (safety: 5, relevance: 5, authenticity: 5) >= 4.
    const res = calculateWeightedScore(scoresWithThrees);
    expect(res.passed).toBe(true);
    expect(res.total).toBe(42);
    expect(res.criticalPassed).toBe(true);
  });

  it("пропускает пост на пороге ровно 35 баллов при соблюдении критических критериев", () => {
    const borderScores = {
      relevance: 4,
      authenticity: 4,
      safety: 4,
      value: 3,
      platformFit: 3,
      completeness: 3,
      language: 4,
      cta: 3,
      visual: 3,
      antiSlop: 4,
    }; // Total: 4*5 + 3*5 = 35.
    const res = calculateWeightedScore(borderScores);
    expect(res.total).toBe(35);
    expect(res.passed).toBe(true);
  });

  it("не пропускает пост с суммой ниже 35 баллов (34/50)", () => {
    const lowScores = {
      relevance: 4,
      authenticity: 4,
      safety: 4,
      value: 3,
      platformFit: 3,
      completeness: 3,
      language: 3,
      cta: 3,
      visual: 3,
      antiSlop: 4,
    }; // Total: 34.
    const res = calculateWeightedScore(lowScores);
    expect(res.total).toBe(34);
    expect(res.passed).toBe(false);
  });

  it("не пропускает пост, если хотя бы один критический критерий ниже 4, даже при высокой сумме", () => {
    // safety < 4
    const unsafe = { ...perfectScores, safety: 3 }; // Total: 48, но safety 3
    const unsafeRes = calculateWeightedScore(unsafe);
    expect(unsafeRes.passed).toBe(false);
    expect(unsafeRes.criticalPassed).toBe(false);
    expect(unsafeRes.failedCriticalCriteria).toContain("safety");

    // relevance < 4
    const irrelevant = { ...perfectScores, relevance: 3 };
    const irrevRes = calculateWeightedScore(irrelevant);
    expect(irrevRes.passed).toBe(false);
    expect(irrevRes.failedCriticalCriteria).toContain("relevance");

    // authenticity < 4
    const fake = { ...perfectScores, authenticity: 2 };
    const fakeRes = calculateWeightedScore(fake);
    expect(fakeRes.passed).toBe(false);
    expect(fakeRes.failedCriticalCriteria).toContain("authenticity");
  });

  it("поддерживает factualAccuracy как алиас для authenticity", () => {
    const withFactual = {
      ...perfectScores,
      authenticity: undefined,
      factualAccuracy: 5,
    };
    const res = calculateWeightedScore(withFactual);
    expect(res.passed).toBe(true);
    expect(res.criticalPassed).toBe(true);
  });
});

describe("B724 · approvedByScorecard & Single-Pass Inline Fixer", () => {
  const scoresPassingWithThrees = {
    relevance: 5,
    value: 5,
    authenticity: 5,
    safety: 5,
    platformFit: 3,
    completeness: 5,
    language: 5,
    cta: 3,
    visual: 5,
    antiSlop: 3,
  }; // Total: 44/50 >= 35, criticals: 5, 5, 5 >= 4.

  it("одобряет решение APPROVE даже при наличии субъективных троек (antiSlop: 3, cta: 3)", () => {
    const review = {
      decision: "APPROVE" as const,
      scores: scoresPassingWithThrees,
      issues: ["Небольшой штамп в первом предложении"],
      revisionBrief: [],
      revisedText: "",
      summary: "В целом отлично",
    };
    expect(approvedByScorecard(review)).toBe(true);
  });

  it("не одобряет REJECT ни при каких баллах", () => {
    const review = {
      decision: "REJECT" as const,
      scores: {
        relevance: 5, value: 5, authenticity: 5, safety: 5, platformFit: 5,
        completeness: 5, language: 5, cta: 5, visual: 5, antiSlop: 5,
      },
      issues: ["Опасный медицинский совет"],
      revisionBrief: [],
      revisedText: "",
      summary: "Отклонено",
    };
    expect(approvedByScorecard(review)).toBe(false);
  });

  it("одобряет исправление с revisedText при решении REVISE и прохождении критических критериев", () => {
    const review = {
      decision: "REVISE" as const,
      scores: scoresPassingWithThrees,
      issues: ["Длина превышена на 15 символов"],
      revisionBrief: ["Убрать одно вводное слово"],
      revisedText: "Исправленный чистый текст поста без лишних слов.",
      summary: "Исправил инлайн",
    };
    expect(approvedByScorecard(review)).toBe(true);
  });

  it("не одобряет REVISE без revisedText", () => {
    const review = {
      decision: "REVISE" as const,
      scores: scoresPassingWithThrees,
      issues: ["Длина превышена на 15 символов"],
      revisionBrief: ["Убрать одно вводное слово"],
      revisedText: "",
      summary: "Требуется доработка",
    };
    expect(approvedByScorecard(review)).toBe(false);
  });

  it("reviewerObject успешно принимает revisedText вместо выбрасывания ошибки", () => {
    const raw = JSON.stringify({
      decision: "APPROVE",
      scores: {
        relevance: 5, value: 5, authenticity: 5, safety: 5, platformFit: 5,
        completeness: 5, language: 5, cta: 5, visual: 5, antiSlop: 5,
      },
      issues: [],
      revisionBrief: [],
      revisedText: "Точечно подправленный редактором текст",
      summary: "Готово",
    });
    const parsed = reviewerObject(raw);
    expect(parsed.revisedText).toBe("Точечно подправленный редактором текст");
    expect(parsed.decision).toBe("APPROVE");
  });

  it("лимит раундов доработки ограничен 1 циклом (1 perPass, 1 lifetime)", () => {
    const limits = marketingEditorialRoundLimits();
    expect(limits.perPass).toBe(1);
    expect(limits.lifetime).toBe(1);
  });
});

describe("B724 · reviewer prompt & CTA synchronization", () => {
  it("threads имеет ctaPolicy = discouraged и maxLinks = 0", async () => {
    const { platformPlaybook } = await import("@/lib/marketing/platform-playbook");
    // B742: вторая такая площадка была Reddit, её убрали из контура целиком.
    const threads = platformPlaybook("threads");

    expect(threads.contract.ctaPolicy).toBe("discouraged");
    expect(threads.contract.maxLinks).toBe(0);
  });

  it("marketingReviewerPrompt включает allowNoCta, когда площадка не требует CTA", async () => {
    const { marketingReviewerPrompt } = await import("@/lib/marketing/agent-prompt");
    const prompt = marketingReviewerPrompt({
      task: { platform: "threads" },
      research: {},
      round: 1,
      candidate: { text: "Пост для Threads" },
      systemRepairs: [],
      previousReview: null,
      allowNoCta: true,
    });
    expect(prompt.allowNoCta).toBe(true);
  });

  it("системный промпт редактора инструктирует о ctaPolicy discouraged и revisedText", async () => {
    const { marketingReviewerSystemPrompt } = await import("@/lib/marketing/agent-prompt");
    const prompt = marketingReviewerSystemPrompt("threads");
    expect(prompt).toContain("ctaPolicy: discouraged");
    expect(prompt).toContain("требования нет — соблюдено");
    expect(prompt).toContain("revisedText");
  });
});

describe("B724 · publishToInstagram (отсутствие is_ai_generated и очистка водяных знаков)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("не передаёт is_ai_generated в Instagram Graph API и очищает скрытые маркеры в caption", async () => {
    jest.doMock("@/lib/marketing/platform-settings", () => ({
      marketingPlatformEnabled: jest.fn().mockResolvedValue(true),
      marketingPlatformValue: jest.fn().mockResolvedValue(null),
      requiredMarketingPlatformValue: jest.fn().mockResolvedValue("stub-value"),
    }));
    jest.doMock("@/lib/marketing/meta-brand-account", () => ({
      assertMetaBrandAccount: jest.fn().mockResolvedValue(undefined),
    }));

    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "container123" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "post123" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ permalink: "https://instagr.am/p/123" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { publishToInstagram } = await import("@/lib/marketing/publish");

    const textWithWatermarks = "Заголовок поста\u200B с невидимыми\uFEFF символами\u{E0001}";
    await publishToInstagram({
      body: textWithWatermarks,
      mediaUrl: "https://eterapy.com/brand/anya_avatar.jpg",
    });

    const createCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(String(createCall[1].body));

    // Проверяем: параметр is_ai_generated полностью отсутствует
    expect(params.get("is_ai_generated")).toBeNull();

    // Проверяем: caption очищен от zero-width и unicode tag символов
    const caption = params.get("caption");
    expect(caption).toBe("Заголовок поста с невидимыми символами");
    expect(hasHiddenMarkers(caption ?? "")).toBe(false);
  });
});

