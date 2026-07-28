/**
 * @jest-environment node
 */
import { createCohereAdapter } from "@/lib/ai-gateway/cohere-adapter";

describe("Cohere v2 adapter", () => {
  it("uses the native Cohere path and ignores reasoning blocks in the answer", async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      message: {
        content: [
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "OK" },
        ],
      },
      finish_reason: "COMPLETE",
      usage: {
        tokens: {
          input_tokens: 4,
          output_tokens: 7,
          reasoning_tokens: 5,
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const adapter = createCohereAdapter({
      apiKey: "test-key",
      baseURL: "https://gateway.ai.cloudflare.com/v1/account/gateway/cohere",
      defaultModel: "command-a-plus-05-2026",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await adapter.complete({
      feature: "test",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 256,
      temperature: 0,
    });

    expect(response).toMatchObject({
      text: "OK",
      model: "command-a-plus-05-2026",
      promptTokens: 4,
      completionTokens: 7,
      totalTokens: 11,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gateway.ai.cloudflare.com/v1/account/gateway/cohere/v2/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
