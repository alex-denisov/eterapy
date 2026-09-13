import { AIProvider } from "@prisma/client";
import {
  AIProviderError,
  classifyProviderError,
  type AIGatewayAdapter,
  type AIGatewayCompletionRequest,
  type AIGatewayCompletionResponse,
  type AIProviderHealth,
} from "@/lib/ai-gateway/adapters";
import { cloudflareGatewayAuthHeaders, isCloudflareAIGatewayUrl } from "@/lib/ai-gateway/cloudflare-gateway";
import type { AIGatewayMessage, AIGatewayMessageContent } from "@/lib/ai-gateway/domain";
import { log, serializeError } from "@/lib/logger";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 30_000;

type GeminiRole = "user" | "model";

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

interface GeminiContent {
  role?: GeminiRole;
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * B742 — СМЕННЫЙ ТРАНСПОРТ: ТОТ ЖЕ ЗАПРОС, ДРУГАЯ ДВЕРЬ.
 *
 * У Gemini два маршрута к одним и тем же моделям — AI Studio и Vertex AI.
 * Тело запроса, разбор ответа, подсчёт токенов, классификация отказа и проба
 * живости у них совпадают ДОСЛОВНО; различаются только адрес и способ
 * авторизации. Второй адаптер копией означал бы два места, где живёт одна
 * правда про `generationConfig`, — и однажды они разошлись бы молча (ровно
 * так уже разошлись две таблицы пределов площадок, B705).
 *
 * Поэтому маршрут — это параметр, а не файл.
 */
export interface GeminiTransport {
  /** Полный адрес `:generateContent` для модели. */
  url(model: string): string | Promise<string>;
  /** Заголовки запроса вместе с авторизацией. */
  headers(): Record<string, string> | Promise<Record<string, string>>;
  /** Настроен ли маршрут: без этого отказ выглядел бы сетевым. */
  configured: boolean;
  /** Что сказать, когда не настроен. */
  missingConfigMessage: string;
}

interface GeminiAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** B742: маршрут Vertex вместо AI Studio. Без него всё как раньше. */
  transport?: GeminiTransport;
}

function contentToText(content: AIGatewayMessageContent) {
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

function dataUrlToPart(url: string): GeminiPart | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-zA-Z0-9+/=]+)$/i.exec(url);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1];
  return { inlineData: { mimeType, data: match[2] } };
}

function imageUrlToPart(url: string): GeminiPart {
  const dataPart = dataUrlToPart(url);
  if (dataPart) return dataPart;
  return {
    fileData: {
      mimeType: url.toLowerCase().includes(".webp")
        ? "image/webp"
        : url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg")
          ? "image/jpeg"
          : "image/png",
      fileUri: url,
    },
  };
}

function contentToParts(content: AIGatewayMessageContent): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  return content.flatMap((block) => {
    if (block.type === "text") return [{ text: block.text }];
    return [imageUrlToPart(block.image_url.url)];
  });
}

function splitSystem(messages: AIGatewayMessage[], inlineSystemInstruction = false) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => contentToText(message.content))
    .join("\n\n")
    .trim();

  let contents = messages
    .filter((message) => message.role !== "system")
    .map((message): GeminiContent => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: contentToParts(message.content),
    }));

  if (inlineSystemInstruction && system) {
    const systemPart = { text: `System instruction:\n${system}` };
    if (contents[0]?.role === "user") {
      contents = [{ ...contents[0], parts: [systemPart, ...contents[0].parts] }, ...contents.slice(1)];
    } else {
      contents = [{ role: "user", parts: [systemPart] }, ...contents];
    }
  }

  return {
    systemInstruction: system && !inlineSystemInstruction ? { parts: [{ text: system }] } : undefined,
    contents: contents.length > 0 ? contents : [{ role: "user" as const, parts: [{ text: "" }] }],
  };
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseError(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return body.error?.message || response.statusText || `HTTP ${response.status}`;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

function joinBaseUrl(baseURL: string, path: string) {
  return `${baseURL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function createGeminiAdapter(options: GeminiAdapterOptions = {}): AIGatewayAdapter {
  const apiKey = options.apiKey ?? "";
  const transport = options.transport;
  const configured = transport ? transport.configured : Boolean(apiKey);
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const defaultModel = options.defaultModel ?? DEFAULT_GEMINI_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function requireConfigured() {
    if (!configured) {
      throw new AIProviderError(transport?.missingConfigMessage ?? "Gemini API key is not configured", {
        provider: AIProvider.GEMINI,
        code: "MISSING_CONFIG",
        retryable: false,
      });
    }
  }

  async function headers() {
    if (transport) return { "content-type": "application/json", ...await transport.headers() };
    return {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      ...cloudflareGatewayAuthHeaders(baseURL),
    };
  }

  async function endpoint(model: string) {
    if (transport) return transport.url(model);
    return joinBaseUrl(baseURL, `models/${model}:generateContent`);
  }

  const adapter: AIGatewayAdapter = {
    provider: AIProvider.GEMINI,

    async complete(request: AIGatewayCompletionRequest): Promise<AIGatewayCompletionResponse> {
      requireConfigured();
      const model = request.model ?? defaultModel;
      const startedAt = Date.now();
      const geminiMessages = splitSystem(request.messages, isCloudflareAIGatewayUrl(baseURL));

      try {
        const response = await fetchWithTimeout(fetchImpl, await endpoint(model), {
          method: "POST",
          headers: await headers(),
          body: JSON.stringify({
            ...geminiMessages,
            generationConfig: {
              maxOutputTokens: request.maxTokens,
              // Gemini 3.5/3.6 deprecated sampling controls and rejects them
              // with HTTP 400. Keep temperature only for older compatible
              // models; marketing is pinned to the current 3.x family.
              ...(!/^gemini-3\.[56]-/.test(model) ? { temperature: request.temperature } : {}),
              // INC-024: gemini-2.5* are *thinking* models and thinking tokens count
              // toward maxOutputTokens — they were eating the budget and truncating
              // structured-JSON answers (chat-analysis разбор was cut off mid-JSON →
              // parse failed → static heuristic fallback). Disable thinking so the
              // whole budget goes to the actual answer (also faster + cheaper). Only
              // 2.5* accept thinkingConfig; older models would reject the field.
              ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        }, request.timeoutMs ?? timeoutMs);

        if (!response.ok) {
          throw Object.assign(new Error(await parseError(response)), { status: response.status });
        }

        const body = await response.json() as GeminiResponse;
        const choice = body.candidates?.[0];
        const text = choice?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("")
          .trim() ?? "";

        if (!text) {
          throw new AIProviderError("Gemini returned an empty completion", {
            provider: AIProvider.GEMINI,
            code: "EMPTY_RESPONSE",
            retryable: true,
          });
        }

        const promptTokens = body.usageMetadata?.promptTokenCount ?? 0;
        const completionTokens = body.usageMetadata?.candidatesTokenCount ?? 0;
        const totalTokens = body.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens;
        const latencyMs = Date.now() - startedAt;

        log.info("ai-gateway-gemini-completed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.GEMINI,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          finishReason: choice?.finishReason,
        });

        return {
          text,
          provider: AIProvider.GEMINI,
          model,
          finishReason: choice?.finishReason,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
        };
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        const classified = classifyProviderError(err);
        log.warn("ai-gateway-gemini-failed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.GEMINI,
          model,
          code: classified.code,
          retryable: classified.retryable,
          error: serializeError(err),
        });
        throw new AIProviderError("Gemini completion failed", {
          provider: AIProvider.GEMINI,
          code: classified.code,
          retryable: classified.retryable,
          cause: err,
        });
      }
    },

    async healthcheck(model = defaultModel): Promise<AIProviderHealth> {
      if (!configured) {
        return {
          provider: AIProvider.GEMINI,
          status: "missing_config",
          model,
          message: transport?.missingConfigMessage ?? "Gemini API key is not configured",
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
          maxTokens: 64,
          temperature: 0,
          timeoutMs,
        });
        return {
          provider: AIProvider.GEMINI,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider: AIProvider.GEMINI,
          status: "down",
          model,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : "Gemini healthcheck failed",
        };
      }
    },
  };

  return adapter;
}
