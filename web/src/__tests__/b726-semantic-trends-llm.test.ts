/**
 * B726 — семантический радар тем.
 * B727 — радар ходит ЧЕРЕЗ ШЛЮЗ МОДЕЛЕЙ, а не в Gemini напрямую своим ключом.
 *
 * Прежние проверки этого файла подавали функции `fetchImpl` и `apiKey` и
 * зеленели, пока на проде радар не запускался ни разу: `GEMINI_API_KEY` и
 * `GOOGLE_CLOUD_API_KEY` в контейнере не заданы, учётки Gemini живут в
 * хранилище шлюза. Тест на выдуманный ключ доказывал разбор ответа, но не
 * доказывал, что вызов вообще состоится.
 */
import { aiComplete } from "@/lib/ai";
import {
  extractSemanticTrendsWithLLM,
  telegramChannelTrends,
} from "@/lib/marketing/trend-telegram";
import { PUBLIC_MARKETING_AI_FEATURES } from "@/lib/marketing/model-pool";

jest.mock("@/lib/ai", () => ({ aiComplete: jest.fn() }));
jest.mock("@/lib/marketing/platform-settings", () => ({
  marketingPlatformValue: jest.fn(async () => null),
}));

const aiCompleteMock = aiComplete as unknown as jest.Mock;

function modelAnswer(payload: unknown, text?: string) {
  return {
    text: text ?? JSON.stringify(payload),
    model: "gemini-3.6-flash",
    provider: "GEMINI",
    tokensIn: 900,
    tokensOut: 220,
    latencyMs: 1200,
  };
}

const TRENDS = {
  trends: [
    {
      userPain: "Парень пишет только после 23:00 и пропадает днём",
      situationHook: "«Ты где?» — почему позднее сообщение злит сильнее молчания",
      category: "relationship",
      targetService: "pair",
      keywords: ["переписка", "молчание", "отношения"],
    },
    {
      userPain: "Проективное зеркало: почему нас бесят определённые люди",
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
};

describe("B726/B727: радар тем через шлюз моделей", () => {
  const samplePosts = [
    "Парень пишет только ночью в выходные, а на неделе игнорит",
    "Подруга вечно занимает деньги и обижается на напоминания",
    "Почему после ссоры наступает ледяное молчание",
  ];

  beforeEach(() => {
    aiCompleteMock.mockReset();
  });

  it("ключ возможности радара зарегистрирован в публичном SMM-периметре", () => {
    // Незарегистрированный ключ получает отказ ПОЛИТИКИ, а не отказ модели:
    // именно так радар и мог бы снова «работать» только в тестах.
    expect(PUBLIC_MARKETING_AI_FEATURES).toContain("marketing-topic-radar");
  });

  it("зовёт шлюз со своим ключом возможности и разбирает ответ", async () => {
    aiCompleteMock.mockResolvedValue(modelAnswer(TRENDS));

    const trends = await extractSemanticTrendsWithLLM(samplePosts, { seed: "test_channel" });

    expect(trends).not.toBeNull();
    expect(trends!.length).toBe(3);
    expect(trends![0].situationHook).toContain("«Ты где?»");
    expect(trends![1].category).toBe("projective");
    expect(trends![2].category).toBe("expert");

    const call = aiCompleteMock.mock.calls[0][0];
    expect(call.feature).toBe("marketing-topic-radar");
    expect(call.dataClass).toBe("PUBLIC_MARKETING");
    // Пул вращается: одна постоянная голова выжгла бы одну бесплатную квоту.
    expect(Array.isArray(call.providerOrder)).toBe(true);
    expect(call.providerOrder.length).toBeGreaterThan(0);
  });

  it("не берёт ключ из окружения — вызов состоится и без переменных", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    aiCompleteMock.mockResolvedValue(modelAnswer(TRENDS));

    const trends = await extractSemanticTrendsWithLLM(samplePosts);

    expect(aiCompleteMock).toHaveBeenCalledTimes(1);
    expect(trends).not.toBeNull();
  });

  it("снимает markdown-ограду, если модель обернула JSON вопреки промту", async () => {
    aiCompleteMock.mockResolvedValue(
      modelAnswer(null, "```json\n" + JSON.stringify(TRENDS) + "\n```"),
    );

    const trends = await extractSemanticTrendsWithLLM(samplePosts);

    expect(trends).not.toBeNull();
    expect(trends!.length).toBe(3);
  });

  it("сбой шлюза и пустой срез постов возвращают null, не роняя проход", async () => {
    aiCompleteMock.mockRejectedValue(new Error("All AI providers failed"));
    expect(await extractSemanticTrendsWithLLM(samplePosts)).toBeNull();

    aiCompleteMock.mockClear();
    expect(await extractSemanticTrendsWithLLM([])).toBeNull();
    // Пустой срез не тратит обращение к модели.
    expect(aiCompleteMock).not.toHaveBeenCalled();
  });

  it("невалидная схема отбрасывается, а не протекает в планировщик", async () => {
    aiCompleteMock.mockResolvedValue(modelAnswer({ trends: [{ userPain: "нет" }] }));
    expect(await extractSemanticTrendsWithLLM(samplePosts)).toBeNull();
  });

  it("telegramChannelTrends отдаёт семантические боли, а не биграммы", async () => {
    const pageHtml = '<div class="tgme_widget_message_text js-message_text">'
      + "Пост про отношения и переписку</div>";
    const mockFetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => pageHtml,
    })) as unknown as typeof fetch;

    aiCompleteMock.mockResolvedValue(modelAnswer({
      trends: [{
        userPain: "Муж обесценивает домашний труд",
        situationHook: "«Ты же весь день дома сидишь» — как не сойти с ума",
        category: "relationship",
        targetService: "pair",
        keywords: ["семья", "обесценивание"],
      }],
    }));

    const candidates = await telegramChannelTrends({
      fetchImpl: mockFetch,
      channels: ["test_channel"],
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].topic).toBe("Муж обесценивает домашний труд");
    expect(candidates[0].rationale).toContain("Болевая точка аудитории (relationship)");
    // Чтение канала идёт своим fetch'ем, а модель — шлюзом: подменённый fetch
    // не должен получить ни одного запроса к модели.
    expect((mockFetch as unknown as jest.Mock).mock.calls.every(
      ([url]) => String(url).includes("t.me"),
    )).toBe(true);
  });
});
