import { AIProvider } from "@prisma/client";
import { AIProviderError } from "@/lib/ai-gateway/adapters";
import { createGeminiAdapter } from "@/lib/ai-gateway/gemini-adapter";

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { info: jest.fn(), warn: jest.fn() },
  serializeError: jest.fn((err) => ({ message: err instanceof Error ? err.message : String(err) })),
}));

describe("Gemini adapter", () => {
  it("calls generateContent with systemInstruction and usage metadata", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [
        { content: { parts: [{ text: "Ответ Gemini" }] }, finishReason: "STOP" },
      ],
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        totalTokenCount: 18,
      },
    }), { status: 200 }));
    const adapter = createGeminiAdapter({
      apiKey: "gemini-key",
      defaultModel: "gemini-2.5-flash",
      fetchImpl,
    });

    const result = await adapter.complete({
      feature: "dialogue-primary-answer",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "Привет" },
      ],
      maxTokens: 64,
      temperature: 0.2,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-goog-api-key": "gemini-key" }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      systemInstruction: { parts: [{ text: "System prompt" }] },
      contents: [{ role: "user", parts: [{ text: "Привет" }] }],
      generationConfig: { maxOutputTokens: 64, temperature: 0.2 },
    }));
    expect(result).toEqual(expect.objectContaining({
      provider: AIProvider.GEMINI,
      model: "gemini-2.5-flash",
      text: "Ответ Gemini",
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    }));
  });

  it("inlines system instructions for Cloudflare Google AI Studio gateway", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [
        { content: { parts: [{ text: "OK" }] }, finishReason: "STOP" },
      ],
      usageMetadata: {
        promptTokenCount: 4,
        candidatesTokenCount: 1,
        totalTokenCount: 5,
      },
    }), { status: 200 }));
    const adapter = createGeminiAdapter({
      apiKey: "gemini-key",
      baseURL: "https://gateway.ai.cloudflare.com/v1/account/gateway/google-ai-studio/v1",
      defaultModel: "gemini-2.5-flash",
      fetchImpl,
    });

    await adapter.complete({
      feature: "ai-healthcheck",
      messages: [
        { role: "system", content: "Return exactly OK." },
        { role: "user", content: "ping" },
      ],
      maxTokens: 64,
      temperature: 0,
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.systemInstruction).toBeUndefined();
    expect(body.contents[0]).toEqual({
      role: "user",
      parts: [
        { text: "System instruction:\nReturn exactly OK." },
        { text: "ping" },
      ],
    });
  });

  it("maps HTTP failures into provider errors for fallback routing", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "rate limited" },
    }), { status: 429 }));
    const adapter = createGeminiAdapter({ apiKey: "gemini-key", fetchImpl });

    await expect(adapter.complete({
      feature: "dialogue-primary-answer",
      messages: [{ role: "user", content: "Привет" }],
    })).rejects.toMatchObject<Partial<AIProviderError>>({
      provider: AIProvider.GEMINI,
      code: "HTTP_429",
      retryable: true,
    });
  });
});
