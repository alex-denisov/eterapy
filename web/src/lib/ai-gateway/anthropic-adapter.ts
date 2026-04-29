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
import type { AIGatewayMessage } from "@/lib/ai-gateway/domain";
import { log, serializeError } from "@/lib/logger";

const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";
const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicResponse {
  model?: string;
  stop_reason?: string | null;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function splitSystem(messages: AIGatewayMessage[]) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));

  return {
    system: system || undefined,
    messages: conversation.length > 0 ? conversation : [{ role: "user" as const, content: "" }],
  };
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseError(response: Response) {
  try {
    const body = await response.json() as { error?: { type?: string; message?: string } };
    return body.error?.message || response.statusText || `HTTP ${response.status}`;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): AIGatewayAdapter {
  const apiKey = options.apiKey ?? "";
  const configured = Boolean(apiKey);
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const defaultModel = options.defaultModel ?? DEFAULT_ANTHROPIC_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function requireConfigured() {
    if (!configured) {
      throw new AIProviderError("Anthropic API key is not configured", {
        provider: AIProvider.ANTHROPIC,
        code: "MISSING_CONFIG",
        retryable: false,
      });
    }
  }

  function headers() {
    return {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      ...cloudflareGatewayAuthHeaders(baseURL),
    };
  }

  return {
    provider: AIProvider.ANTHROPIC,

    async complete(request: AIGatewayCompletionRequest): Promise<AIGatewayCompletionResponse> {
      requireConfigured();
      const model = request.model ?? defaultModel;
      const startedAt = Date.now();
      const anthropicMessages = splitSystem(request.messages);

      try {
        const response = await fetchWithTimeout(fetchImpl, `${baseURL}/messages`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            model,
            max_tokens: request.maxTokens ?? 1024,
            temperature: request.temperature,
            system: anthropicMessages.system,
            messages: anthropicMessages.messages,
          }),
        }, request.timeoutMs ?? timeoutMs);

        if (!response.ok) {
          throw Object.assign(new Error(await parseError(response)), { status: response.status });
        }

        const body = await response.json() as AnthropicResponse;
        const text = body.content
          ?.filter((block) => block.type === "text" || block.text)
          .map((block) => block.text ?? "")
          .join("")
          .trim() ?? "";

        if (!text) {
          throw new AIProviderError("Anthropic returned an empty completion", {
            provider: AIProvider.ANTHROPIC,
            code: "EMPTY_RESPONSE",
            retryable: true,
          });
        }

        const promptTokens = body.usage?.input_tokens ?? 0;
        const completionTokens = body.usage?.output_tokens ?? 0;
        const totalTokens = promptTokens + completionTokens;
        const latencyMs = Date.now() - startedAt;

        log.info("ai-gateway-anthropic-completed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.ANTHROPIC,
          model: body.model ?? model,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          finishReason: body.stop_reason,
        });

        return {
          text,
          provider: AIProvider.ANTHROPIC,
          model: body.model ?? model,
          finishReason: body.stop_reason,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
        };
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        const classified = classifyProviderError(err);
        log.warn("ai-gateway-anthropic-failed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.ANTHROPIC,
          model,
          code: classified.code,
          retryable: classified.retryable,
          error: serializeError(err),
        });
        throw new AIProviderError("Anthropic completion failed", {
          provider: AIProvider.ANTHROPIC,
          code: classified.code,
          retryable: classified.retryable,
          cause: err,
        });
      }
    },

    async healthcheck(model = defaultModel): Promise<AIProviderHealth> {
      if (!configured) {
        return {
          provider: AIProvider.ANTHROPIC,
          status: "missing_config",
          model,
          message: "ANTHROPIC_API_KEY is not configured",
        };
      }

      const startedAt = Date.now();
      try {
        const response = await fetchWithTimeout(fetchImpl, `${baseURL}/models/${encodeURIComponent(model)}`, {
          method: "GET",
          headers: headers(),
        }, timeoutMs);
        if (!response.ok) {
          throw Object.assign(new Error(await parseError(response)), { status: response.status });
        }
        return {
          provider: AIProvider.ANTHROPIC,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider: AIProvider.ANTHROPIC,
          status: "down",
          model,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : "Anthropic healthcheck failed",
        };
      }
    },
  };
}
