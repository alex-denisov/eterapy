import OpenAI from "openai";
import { type AIProvider } from "@prisma/client";
import {
  AIProviderError,
  classifyProviderError,
  type AIGatewayAdapter,
  type AIGatewayCompletionRequest,
  type AIGatewayCompletionResponse,
  type AIProviderHealth,
} from "@/lib/ai-gateway/adapters";
import {
  cloudflareGatewayAuthHeaders,
} from "@/lib/ai-gateway/cloudflare-gateway";
import type { AIGatewayMessageContent } from "@/lib/ai-gateway/domain";
import { log, serializeError } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 30_000;

interface OpenAICompatibleClientLike {
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
        choices?: Array<{
          message?: {
            content?: string | null;
            reasoning_content?: string | null;
          };
          finish_reason?: string | null;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      }>;
    };
  };
}

export interface OpenAICompatibleAdapterOptions {
  provider: AIProvider;
  providerSlug: string;
  missingConfigMessage: string;
  apiKey?: string;
  baseURL: string;
  defaultModel: string;
  timeoutMs?: number;
  client?: OpenAICompatibleClientLike;
  defaultHeaders?: Record<string, string>;
}

function responseText(choice: {
  message?: { content?: string | null; reasoning_content?: string | null };
} | undefined) {
  return (choice?.message?.content ?? choice?.message?.reasoning_content ?? "").trim();
}

export function createOpenAICompatibleAdapter(options: OpenAICompatibleAdapterOptions): AIGatewayAdapter {
  const configured = Boolean(options.client || options.apiKey);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gatewayHeaders = cloudflareGatewayAuthHeaders(options.baseURL);
  const client: OpenAICompatibleClientLike | null = options.client ?? (configured
    ? new OpenAI({
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL,
      defaultHeaders: {
        ...gatewayHeaders,
        ...(options.defaultHeaders ?? {}),
      },
    }) as unknown as OpenAICompatibleClientLike
    : null);

  function requireClient() {
    if (!client) {
      throw new AIProviderError(options.missingConfigMessage, {
        provider: options.provider,
        code: "MISSING_CONFIG",
        retryable: false,
      });
    }
    return client;
  }

  const adapter: AIGatewayAdapter = {
    provider: options.provider,

    async complete(request: AIGatewayCompletionRequest): Promise<AIGatewayCompletionResponse> {
      const model = request.model ?? options.defaultModel;
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
        const text = responseText(choice);
        if (!text) {
          throw new AIProviderError(`${options.providerSlug} returned an empty completion`, {
            provider: options.provider,
            code: "EMPTY_RESPONSE",
            retryable: true,
          });
        }

        const promptTokens = response.usage?.prompt_tokens ?? 0;
        const completionTokens = response.usage?.completion_tokens ?? 0;
        const totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;

        log.info("ai-gateway-openai-compatible-completed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: options.provider,
          model: response.model ?? model,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          finishReason: choice?.finish_reason,
        });

        return {
          text,
          provider: options.provider,
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
        log.warn("ai-gateway-openai-compatible-failed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: options.provider,
          model,
          code: classified.code,
          retryable: classified.retryable,
          error: serializeError(err),
        });
        throw new AIProviderError(`${options.providerSlug} completion failed`, {
          provider: options.provider,
          code: classified.code,
          retryable: classified.retryable,
          cause: err,
        });
      }
    },

    async healthcheck(model = options.defaultModel): Promise<AIProviderHealth> {
      if (!client) {
        return {
          provider: options.provider,
          status: "missing_config",
          model,
          message: options.missingConfigMessage,
        };
      }

      const startedAt = Date.now();
      try {
        await adapter.complete({
          feature: "ai-healthcheck",
          messages: [
            { role: "system", content: "Return exactly OK and no explanation." },
            { role: "user", content: "ping" },
          ],
          model,
          maxTokens: 128,
          temperature: 0,
          timeoutMs,
        });
        return {
          provider: options.provider,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider: options.provider,
          status: "down",
          model,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : `${options.providerSlug} healthcheck failed`,
        };
      }
    },
  };

  return adapter;
}
