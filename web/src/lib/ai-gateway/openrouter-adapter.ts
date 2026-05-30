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
import { cloudflareGatewayAuthHeaders } from "@/lib/ai-gateway/cloudflare-gateway";
import type { AIGatewayMessageContent } from "@/lib/ai-gateway/domain";
import { log, serializeError } from "@/lib/logger";

const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Helper for UI hints: returns true if the model id is a free variant
 * (suffix `:free`) or an OpenRouter free-pool meta id (`openrouter/free`).
 * No longer used to reject paid models — admins may select any model id.
 */
export function isFreeOpenRouterModel(model: string | undefined | null): boolean {
  if (!model) return false;
  const normalized = model.trim().toLowerCase();
  return normalized.endsWith(":free") || normalized === "openrouter/free";
}

interface OpenRouterClientLike {
  chat: {
    completions: {
      create: (
        body: {
          model: string;
          messages: Array<{ role: "system" | "user" | "assistant"; content: AIGatewayMessageContent }>;
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

export interface OpenRouterAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  timeoutMs?: number;
  referer?: string;
  title?: string;
  client?: OpenRouterClientLike;
}

function attributionHeaders(options: OpenRouterAdapterOptions) {
  const referer = options.referer ?? process.env.OPENROUTER_REFERER;
  const title = options.title ?? process.env.OPENROUTER_TITLE;
  return {
    ...(referer ? { "HTTP-Referer": referer } : {}),
    ...(title ? { "X-OpenRouter-Title": title } : {}),
  };
}

export function createOpenRouterAdapter(options: OpenRouterAdapterOptions = {}): AIGatewayAdapter {
  const configured = Boolean(options.client || options.apiKey);
  const defaultModel = options.defaultModel ?? DEFAULT_OPENROUTER_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client: OpenRouterClientLike | null = options.client ?? (configured
    ? new OpenAI({
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      defaultHeaders: {
        ...attributionHeaders(options),
        ...cloudflareGatewayAuthHeaders(options.baseURL ?? DEFAULT_BASE_URL),
      },
    }) as unknown as OpenRouterClientLike
    : null);

  function requireClient() {
    if (!client) {
      throw new AIProviderError("OpenRouter API key is not configured", {
        provider: AIProvider.OPENROUTER,
        code: "MISSING_CONFIG",
        retryable: false,
      });
    }
    return client;
  }

  return {
    provider: AIProvider.OPENROUTER,

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
          throw new AIProviderError("OpenRouter returned an empty completion", {
            provider: AIProvider.OPENROUTER,
            code: "EMPTY_RESPONSE",
            retryable: true,
          });
        }

        const promptTokens = response.usage?.prompt_tokens ?? 0;
        const completionTokens = response.usage?.completion_tokens ?? 0;
        const totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;

        log.info("ai-gateway-openrouter-completed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.OPENROUTER,
          model: response.model ?? model,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          finishReason: choice?.finish_reason,
        });

        return {
          text,
          provider: AIProvider.OPENROUTER,
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
        log.warn("ai-gateway-openrouter-failed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.OPENROUTER,
          model,
          code: classified.code,
          retryable: classified.retryable,
          error: serializeError(err),
        });
        throw new AIProviderError("OpenRouter completion failed", {
          provider: AIProvider.OPENROUTER,
          code: classified.code,
          retryable: classified.retryable,
          cause: err,
        });
      }
    },

    async healthcheck(model = defaultModel): Promise<AIProviderHealth> {
      if (!client) {
        return {
          provider: AIProvider.OPENROUTER,
          status: "missing_config",
          model,
          message: "OPENROUTER_API_KEY is not configured",
        };
      }

      const startedAt = Date.now();
      try {
        // M8: probe with a tiny completion, NOT models.retrieve. The default
        // free id "openrouter/free" is a meta-router valid only for
        // /chat/completions; GET /models/openrouter/free returns 404, which
        // falsely marked OpenRouter "down" and circuit-broke the primary free
        // provider, pushing routing onto paid providers.
        const response = await requireClient().chat.completions.create(
          { model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 },
          { timeout: timeoutMs },
        );
        const ok = Array.isArray(response.choices);
        return {
          provider: AIProvider.OPENROUTER,
          status: ok ? "ok" : "down",
          model: response.model ?? model,
          latencyMs: Date.now() - startedAt,
          ...(ok ? {} : { message: "OpenRouter healthcheck returned no choices" }),
        };
      } catch (err) {
        return {
          provider: AIProvider.OPENROUTER,
          status: "down",
          model,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : "OpenRouter healthcheck failed",
        };
      }
    },
  };
}
