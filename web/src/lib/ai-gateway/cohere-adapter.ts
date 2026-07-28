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

const DEFAULT_TIMEOUT_MS = 30_000;

interface CohereAdapterOptions {
  apiKey?: string;
  baseURL: string;
  defaultModel: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface CohereResponse {
  message?: {
    content?: Array<{ type?: string; text?: string }>;
  };
  finish_reason?: string;
  usage?: {
    tokens?: {
      input_tokens?: number;
      output_tokens?: number;
      reasoning_tokens?: number;
    };
  };
  message_text?: string;
}

function contentToText(content: AIGatewayMessageContent) {
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

function cohereUrl(baseURL: string) {
  const base = baseURL.replace(/\/+$/, "");
  return `${base}/v2/chat`;
}

async function errorMessage(response: Response) {
  const payload = await response.json().catch(() => null) as {
    message?: unknown;
    error?: { message?: unknown };
  } | null;
  return String(payload?.error?.message ?? payload?.message ?? `HTTP ${response.status}`);
}

export function createCohereAdapter(options: CohereAdapterOptions): AIGatewayAdapter {
  const configured = Boolean(options.apiKey);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function complete(request: AIGatewayCompletionRequest): Promise<AIGatewayCompletionResponse> {
    if (!configured) {
      throw new AIProviderError("Cohere API key is not configured", {
        provider: AIProvider.COHERE,
        code: "MISSING_CONFIG",
      });
    }
    const model = request.model ?? options.defaultModel;
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(cohereUrl(options.baseURL), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          ...cloudflareGatewayAuthHeaders(options.baseURL),
        },
        body: JSON.stringify({
          model,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: contentToText(message.content),
          })),
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? timeoutMs),
      });
      if (!response.ok) {
        throw Object.assign(new Error(await errorMessage(response)), { status: response.status });
      }
      const payload = await response.json() as CohereResponse;
      const text = payload.message?.content
        ?.filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("")
        .trim() ?? "";
      if (!text) {
        throw new AIProviderError("Cohere returned an empty completion", {
          provider: AIProvider.COHERE,
          code: "EMPTY_RESPONSE",
          retryable: true,
        });
      }
      const promptTokens = payload.usage?.tokens?.input_tokens ?? 0;
      const completionTokens = payload.usage?.tokens?.output_tokens ?? 0;
      const latencyMs = Date.now() - startedAt;
      log.info("ai-gateway-cohere-completed", {
        requestId: request.requestId,
        feature: request.feature,
        provider: AIProvider.COHERE,
        model,
        promptTokens,
        completionTokens,
        latencyMs,
        finishReason: payload.finish_reason,
      });
      return {
        text,
        provider: AIProvider.COHERE,
        model,
        finishReason: payload.finish_reason,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      const classified = classifyProviderError(error);
      log.warn("ai-gateway-cohere-failed", {
        requestId: request.requestId,
        feature: request.feature,
        provider: AIProvider.COHERE,
        model,
        code: classified.code,
        error: serializeError(error),
      });
      throw new AIProviderError("Cohere completion failed", {
        provider: AIProvider.COHERE,
        code: classified.code,
        retryable: classified.retryable,
        cause: error,
      });
    }
  }

  return {
    provider: AIProvider.COHERE,
    complete,
    async healthcheck(model = options.defaultModel): Promise<AIProviderHealth> {
      const startedAt = Date.now();
      try {
        await complete({
          feature: "ai-healthcheck",
          messages: [{ role: "user", content: "Return exactly OK." }],
          model,
          maxTokens: 256,
          temperature: 0,
          timeoutMs,
        });
        return {
          provider: AIProvider.COHERE,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        const providerError = error instanceof AIProviderError ? error : null;
        return {
          provider: AIProvider.COHERE,
          status: configured ? "down" : "missing_config",
          model,
          latencyMs: Date.now() - startedAt,
          code: providerError?.code,
          message: providerError
            ? `Cohere healthcheck failed (${providerError.code})`
            : error instanceof Error
              ? error.message
              : "Cohere healthcheck failed",
        };
      }
    },
  };
}
