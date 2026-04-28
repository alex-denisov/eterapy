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

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

interface OpenAIClientLike {
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

export interface OpenAIAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  timeoutMs?: number;
  client?: OpenAIClientLike;
}

export function createOpenAIAdapter(options: OpenAIAdapterOptions = {}): AIGatewayAdapter {
  const configured = Boolean(options.client || options.apiKey);
  const defaultModel = options.defaultModel ?? DEFAULT_OPENAI_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client: OpenAIClientLike | null = options.client ?? (configured
    ? new OpenAI({
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL,
    })
    : null);

  function requireClient() {
    if (!client) {
      throw new AIProviderError("OpenAI API key is not configured", {
        provider: AIProvider.OPENAI,
        code: "MISSING_CONFIG",
        retryable: false,
      });
    }
    return client;
  }

  return {
    provider: AIProvider.OPENAI,

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
          throw new AIProviderError("OpenAI returned an empty completion", {
            provider: AIProvider.OPENAI,
            code: "EMPTY_RESPONSE",
            retryable: true,
          });
        }

        const promptTokens = response.usage?.prompt_tokens ?? 0;
        const completionTokens = response.usage?.completion_tokens ?? 0;
        const totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;

        log.info("ai-gateway-openai-completed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.OPENAI,
          model: response.model ?? model,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          finishReason: choice?.finish_reason,
        });

        return {
          text,
          provider: AIProvider.OPENAI,
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
        log.warn("ai-gateway-openai-failed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.OPENAI,
          model,
          code: classified.code,
          retryable: classified.retryable,
          error: serializeError(err),
        });
        throw new AIProviderError("OpenAI completion failed", {
          provider: AIProvider.OPENAI,
          code: classified.code,
          retryable: classified.retryable,
          cause: err,
        });
      }
    },

    async healthcheck(model = defaultModel): Promise<AIProviderHealth> {
      if (!client) {
        return {
          provider: AIProvider.OPENAI,
          status: "missing_config",
          model,
          message: "OPENAI_API_KEY is not configured",
        };
      }

      const startedAt = Date.now();
      try {
        await client.models?.retrieve(model, { timeout: timeoutMs });
        return {
          provider: AIProvider.OPENAI,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider: AIProvider.OPENAI,
          status: "down",
          model,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : "OpenAI healthcheck failed",
        };
      }
    },
  };
}
