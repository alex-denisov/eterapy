import {
  extractSemanticTrendsWithLLM,
  telegramChannelTrends,
} from "@/lib/marketing/trend-telegram";

describe("B726: Intelligent Topic Radar via Gemini Flash", () => {
  const samplePosts = [
    "Парень пишет только ночью в выходные, а на неделе игнорит",
    "Подруга вечно занимает деньги и обижается на напоминания",
    "Как понять, что пора увольняться, а не просто устал",
    "Карта дня Таро: Башня и переосмысление старых планов",
    "Почему после ссоры наступает ледяное молчание",
  ];

  it("extractSemanticTrendsWithLLM корректно парсит ответ Gemini Flash и валидирует Zod-схему", async () => {
    const mockApiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  trends: [
                    {
                      userPain: "Парень пишет только после 23:00 и пропадает днём",
                      situationHook: "«Ты где?» — почему позднее сообщение злит сильнее молчания",
                      category: "relationship",
                      targetService: "pair",
                      keywords: ["переписка", "молчание", "отношения"],
                    },
                    {
                      userPain: "Страх напомнить должнику про долг из-за чувства вины",
                      situationHook: "Почему стыдно просить СВОИ деньги обратно",
                      category: "relationship",
                      targetService: "reframe",
                      keywords: ["деньги", "вина", "границы"],
                    },
                    {
                      userPain: "Проективное зеркало: почему нас бесят определенные люди",
                      situationHook: "Тень по Юнгу: кого мы на самом деле не выносим",
                      category: "projective",
                      targetService: "tarot",
                      keywords: ["юнг", "архетип", "проекция"],
                    },
                    {
                      userPain: "Эмоциональное выгорание на работе и потеря смысла",
                      situationHook: "Когда отпуск больше не спасает от усталости",
                      category: "expert",
                      targetService: "reframe",
                      keywords: ["выгорание", "работа", "выбор"],
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    const mockFetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    })) as unknown as typeof fetch;

    const trends = await extractSemanticTrendsWithLLM(samplePosts, {
      fetchImpl: mockFetch,
      apiKey: "test-api-key",
    });

    expect(trends).not.toBeNull();
    expect(trends!.length).toBe(4);
    expect(trends![0].userPain).toContain("Парень пишет только после 23:00");
    expect(trends![0].situationHook).toContain("«Ты где?»");
    expect(trends![0].category).toBe("relationship");
    expect(trends![2].category).toBe("projective");
    expect(trends![3].category).toBe("expert");
  });

  it("extractSemanticTrendsWithLLM безопасно возвращает null при сбое сети или невалидном JSON", async () => {
    const brokenFetch = jest.fn(async () => ({
      ok: false,
      status: 503,
    })) as unknown as typeof fetch;

    const result = await extractSemanticTrendsWithLLM(samplePosts, {
      fetchImpl: brokenFetch,
      apiKey: "test-api-key",
    });
    expect(result).toBeNull();

    const emptyResult = await extractSemanticTrendsWithLLM([], {
      apiKey: "test-api-key",
    });
    expect(emptyResult).toBeNull();
  });

  it("telegramChannelTrends использует семантические боли от LLM", async () => {
    const pageHtml = `<div class="tgme_widget_message_text js-message_text">Пост про отношения и переписку</div>`;

    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes("t.me")) {
        return {
          ok: true,
          status: 200,
          text: async () => pageHtml,
        } as unknown as Response;
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        trends: [
                          {
                            userPain: "Муж обесценивает домашний труд",
                            situationHook: "«Ты же весь день дома сидишь» — как не сойти с ума",
                            category: "relationship",
                            targetService: "pair",
                            keywords: ["семья", "обесценивание"],
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 500 } as unknown as Response;
    });

    process.env.GEMINI_API_KEY = "test-key";
    const candidates = await telegramChannelTrends({
      fetchImpl: mockFetch as unknown as typeof fetch,
      channels: ["test_channel"],
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].topic).toBe("Муж обесценивает домашний труд");
    expect(candidates[0].rationale).toContain("Болевая точка аудитории (relationship)");
  });
});
