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

const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.1-70b-instruct:free";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

export function isFreeOpenRouterModel(model: string | undefined | null): boolean {
  if (!model) return false;
  return model.trim().toLowerCase().endsWith(":free");
}

export function assertFreeOpenRouterModel(model: string): void {
  if (!isFreeOpenRouterModel(model)) {
    throw new AIProviderError(
      `OpenRouter is restricted to free models; "${model}" does not have the :free suffix`,
      {
        provider: AIProvider.OPENROUTER,
        code: "MODEL_NOT_ALLOWED",
        retryable: false,
      }
    );
  }
}

interface OpenRouterClientLike {
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
      defaultHeaders: attributionHeaders(options),
    })
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
      assertFreeOpenRouterModel(model);
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
        await client.models?.retrieve(model, { timeout: timeoutMs });
        return {
          provider: AIProvider.OPENROUTER,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
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
