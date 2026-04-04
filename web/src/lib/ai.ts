import OpenAI from "openai";

/**
 * ETerapy AI Client
 *
 * Стратегия:
 * 1. openrouter/free — автороутер, сам выбирает лучшую бесплатную модель
 * 2. Конкретные бесплатные модели по очереди
 * 3. OpenAI ChatGPT как fallback
 *
 * При ошибке (rate limit, 503, 404) — следующая модель.
 */

const MODELS_CHAIN = [
  // Автороутер — пробует сам из всех доступных бесплатных
  "openrouter/free",
  // Конкретные модели на случай если автороутер недоступен
  "deepseek/deepseek-chat-v3.1:free",
  "meta-llama/llama-4-maverick:free",
  "qwen/qwen3-235b-a22b:free",
  "deepseek/deepseek-r1:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": "https://eterapy.ru",
    "X-Title": "ETerapy",
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

interface AIRequestOptions {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

interface AIResponse {
  text: string;
  model: string;
  provider: "openrouter" | "openai";
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export async function aiComplete(
  options: AIRequestOptions
): Promise<AIResponse> {
  const { messages, maxTokens = 2000, temperature = 0.7 } = options;
  const errors: Array<{ model: string; error: string }> = [];

  // 1. OpenRouter: автороутер + конкретные модели
  for (const model of MODELS_CHAIN) {
    try {
      const startTime = Date.now();
      const response = await openrouter.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      const latencyMs = Date.now() - startTime;
      const text = response.choices?.[0]?.message?.content || "";
      const finishReason = response.choices?.[0]?.finish_reason;

      if (!text.trim()) {
        errors.push({ model, error: "empty response" });
        continue;
      }

      // finish_reason=length means truncation — skip this model
      if (finishReason === "length") {
        errors.push({ model, error: "response truncated (finish_reason=length)" });
        console.warn(`[AI] ⚠️ ${model} truncated output — trying next model`);
        continue;
      }

      // Если openrouter/free, узнаём реальную модель из response
      const actualModel =
        (response as unknown as { model?: string }).model || model;

      console.log(
        `[AI] ✅ ${actualModel} | finish=${finishReason} | tokens_in=${response.usage?.prompt_tokens ?? "?"} tokens_out=${response.usage?.completion_tokens ?? "?"} latency=${latencyMs}ms`
      );

      return {
        text,
        model: actualModel,
        provider: "openrouter",
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: response.usage?.completion_tokens ?? 0,
        latencyMs,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ model, error: errorMsg });
      console.warn(`[AI] ⚠️ ${model} failed: ${errorMsg}`);
      continue;
    }
  }

  // 2. Fallback на OpenAI
  try {
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: OPENAI_FALLBACK_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    });

    const latencyMs = Date.now() - startTime;
    const text = response.choices?.[0]?.message?.content || "";

    console.log(
      `[AI] ✅ OpenAI ${OPENAI_FALLBACK_MODEL} (fallback) | tokens_in=${response.usage?.prompt_tokens ?? "?"} tokens_out=${response.usage?.completion_tokens ?? "?"} latency=${latencyMs}ms`
    );

    return {
      text,
      model: OPENAI_FALLBACK_MODEL,
      provider: "openai",
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      latencyMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push({ model: `openai/${OPENAI_FALLBACK_MODEL}`, error: errorMsg });
    console.error(`[AI] ❌ All models failed:`, errors);
    throw new Error(
      `All AI models unavailable. Tried ${errors.length} models. Last error: ${errorMsg}`
    );
  }
}
