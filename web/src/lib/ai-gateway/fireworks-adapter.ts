import OpenAI from "openai";
import { AIProvider } from "@prisma/client";
import {
  AIProviderError,
  classifyProviderError,
  type AIGatewayAdapter,
  type AIGatewayCompletionRequest,
  type AIGatewayCompletionResponse,
  type AIProviderHealth,
} from "@/lib/ai-gateway/adapters";
import { log, serializeError } from "@/lib/logger";

const DEFAULT_FIREWORKS_MODEL = "accounts/fireworks/models/llama-v3p1-8b-instruct";
const DEFAULT_BASE_URL = "https://api.fireworks.ai/inference/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

interface FireworksClientLike {
  chat: {
    completions: {
      create: (
        body: {
          model: string;
          messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
          max_tokens?: number;
          temperature?: number;
        },
        options?: { timeout?: number }
      ) => Promise<{
        model?: string;
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      }>;
    };
  };
  models?: {
    retrieve: (model: string, options?: { timeout?: number }) => Promise<unknown>;
  };
}

export interface FireworksAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  timeoutMs?: number;
  client?: FireworksClientLike;
}

export function createFireworksAdapter(options: FireworksAdapterOptions = {}): AIGatewayAdapter {
  const configured = Boolean(options.client || options.apiKey);
  const defaultModel = options.defaultModel ?? DEFAULT_FIREWORKS_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client: FireworksClientLike | null = options.client ?? (configured
    ? new OpenAI({
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
    })
    : null);

  function requireClient() {
    if (!client) {
      throw new AIProviderError("Fireworks API key is not configured", {
        provider: AIProvider.FIREWORKS,
        code: "MISSING_CONFIG",
        retryable: false,
      });
    }
    return client;
  }

  return {
    provider: AIProvider.FIREWORKS,

    async complete(request: AIGatewayCompletionRequest): Promise<AIGatewayCompletionResponse> {
      const model = request.model ?? defaultModel;
      const startedAt = Date.now();
      try {
        const response = await requireClient().chat.completions.create({
          model,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        }, {
          timeout: request.timeoutMs ?? timeoutMs,
        });

        const latencyMs = Date.now() - startedAt;
        const choice = response.choices?.[0];
        const text = choice?.message?.content ?? "";
        if (!text.trim()) {
          throw new AIProviderError("Fireworks returned an empty completion", {
            provider: AIProvider.FIREWORKS,
            code: "EMPTY_RESPONSE",
            retryable: true,
          });
        }

        const promptTokens = response.usage?.prompt_tokens ?? 0;
        const completionTokens = response.usage?.completion_tokens ?? 0;
        const totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;

        log.info("ai-gateway-fireworks-completed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.FIREWORKS,
          model: response.model ?? model,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          finishReason: choice?.finish_reason,
        });

        return {
          text,
          provider: AIProvider.FIREWORKS,
          model: response.model ?? model,
          finishReason: choice?.finish_reason,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
        };
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        const classified = classifyProviderError(err);
        log.warn("ai-gateway-fireworks-failed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.FIREWORKS,
          model,
          code: classified.code,
          retryable: classified.retryable,
          error: serializeError(err),
        });
        throw new AIProviderError("Fireworks completion failed", {
          provider: AIProvider.FIREWORKS,
          code: classified.code,
          retryable: classified.retryable,
          cause: err,
        });
      }
    },

    async healthcheck(model = defaultModel): Promise<AIProviderHealth> {
      if (!client) {
        return {
          provider: AIProvider.FIREWORKS,
          status: "missing_config",
          model,
          message: "FIREWORKS_API_KEY is not configured",
        };
      }

      const startedAt = Date.now();
      try {
        await client.models?.retrieve(model, { timeout: timeoutMs });
        return {
          provider: AIProvider.FIREWORKS,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider: AIProvider.FIREWORKS,
          status: "down",
          model,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : "Fireworks healthcheck failed",
        };
      }
    },
  };
}
