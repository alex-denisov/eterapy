import { AIProvider } from "@prisma/client";
import {
  AIProviderError,
  classifyProviderError,
  type AIGatewayAdapter,
  type AIGatewayCompletionRequest,
  type AIGatewayCompletionResponse,
  type AIProviderHealth,
} from "@/lib/ai-gateway/adapters";
import type { AIGatewayMessageContent } from "@/lib/ai-gateway/domain";
import { log, serializeError } from "@/lib/logger";

export const YANDEX_FOUNDATION_MODELS_BASE_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1";
export const YANDEX_OCR_BASE_URL = "https://ocr.api.cloud.yandex.net/ocr/v1";
export const DEFAULT_YANDEX_MODEL = "yandexgpt/latest";
export const YANDEX_VISION_OCR_MODEL = "yandex-vision-ocr";

const DEFAULT_TIMEOUT_MS = 30_000;

interface YandexCompletionResponse {
  alternatives?: Array<{
    message?: {
      role?: string;
      text?: string;
    };
    status?: string;
  }>;
  usage?: {
    inputTextTokens?: string | number;
    completionTokens?: string | number;
    totalTokens?: string | number;
  };
  modelVersion?: string;
  result?: {
    alternatives?: YandexCompletionResponse["alternatives"];
    usage?: YandexCompletionResponse["usage"];
    modelVersion?: string;
  };
}

interface YandexOcrResponse {
  result?: {
    textAnnotation?: {
      fullText?: string;
      blocks?: Array<{
        lines?: Array<{ text?: string }>;
      }>;
    };
  };
}

export interface YandexAdapterOptions {
  apiKey?: string;
  folderId?: string;
  baseURL?: string;
  ocrBaseURL?: string;
  defaultModel?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function trimSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function tokenCount(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textFromContent(content: AIGatewayMessageContent): string {
  if (typeof content === "string") return content;
  const text = content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  const hasImages = content.some((block) => block.type === "image_url");
  if (hasImages) {
    throw new AIProviderError("Yandex AI Studio text adapter does not support image content", {
      provider: AIProvider.YANDEX,
      code: "UNSUPPORTED_CONTENT",
      retryable: false,
    });
  }
  return text;
}

function imageDataUrlFromContent(content: AIGatewayMessageContent): string | null {
  if (typeof content === "string") return null;
  for (const block of content) {
    if (block.type === "image_url") return block.image_url.url;
  }
  return null;
}

function firstImageDataUrl(messages: AIGatewayCompletionRequest["messages"]) {
  for (const message of messages) {
    const dataUrl = imageDataUrlFromContent(message.content);
    if (dataUrl) return dataUrl;
  }
  return null;
}

function parseImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new AIProviderError("Yandex Vision OCR requires a base64 data URL image", {
      provider: AIProvider.YANDEX,
      code: "UNSUPPORTED_CONTENT",
      retryable: false,
    });
  }
  const mimeType = match[1]?.toLowerCase();
  const content = match[2];
  const mimeTypeForYandex = mimeType === "image/png"
    ? "PNG"
    : mimeType === "image/jpeg" || mimeType === "image/jpg"
      ? "JPEG"
      : null;
  if (!mimeTypeForYandex || !content) {
    throw new AIProviderError("Yandex Vision OCR supports PNG and JPEG screenshots only", {
      provider: AIProvider.YANDEX,
      code: "UNSUPPORTED_CONTENT",
      retryable: false,
    });
  }
  return { mimeType: mimeTypeForYandex, content };
}

function yandexModelUri(folderId: string, model: string) {
  if (model.startsWith("gpt://")) return model;
  return `gpt://${folderId}/${model}`;
}

export function createYandexAdapter(options: YandexAdapterOptions = {}): AIGatewayAdapter {
  const apiKey = options.apiKey?.trim() ?? "";
  const folderId = options.folderId?.trim() ?? "";
  const defaultModel = options.defaultModel ?? DEFAULT_YANDEX_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseURL = trimSlashes(options.baseURL ?? YANDEX_FOUNDATION_MODELS_BASE_URL);
  const ocrBaseURL = trimSlashes(options.ocrBaseURL ?? YANDEX_OCR_BASE_URL);

  function requireConfig() {
    if (!apiKey || !folderId) {
      throw new AIProviderError("Yandex API key or folder id is not configured", {
        provider: AIProvider.YANDEX,
        code: "MISSING_CONFIG",
        retryable: false,
      });
    }
  }

  const adapter: AIGatewayAdapter = {
    provider: AIProvider.YANDEX,

    async complete(request: AIGatewayCompletionRequest): Promise<AIGatewayCompletionResponse> {
      requireConfig();
      const model = request.model ?? defaultModel;
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? timeoutMs);

      try {
        const imageDataUrl = firstImageDataUrl(request.messages);
        if (imageDataUrl || model === YANDEX_VISION_OCR_MODEL) {
          const image = imageDataUrl ? parseImageDataUrl(imageDataUrl) : null;
          if (!image) {
            throw new AIProviderError("Yandex Vision OCR request is missing image content", {
              provider: AIProvider.YANDEX,
              code: "UNSUPPORTED_CONTENT",
              retryable: false,
            });
          }

          const response = await fetchImpl(`${ocrBaseURL}/recognizeText`, {
            method: "POST",
            headers: {
              Authorization: `Api-Key ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mimeType: image.mimeType,
              languageCodes: ["ru", "en"],
              model: "page",
              content: image.content,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw Object.assign(new Error(`Yandex Vision OCR failed with HTTP ${response.status}`), {
              status: response.status,
            });
          }

          const data = await response.json() as YandexOcrResponse;
          const text = data.result?.textAnnotation?.fullText?.trim()
            || data.result?.textAnnotation?.blocks
              ?.flatMap((block) => block.lines ?? [])
              .map((line) => line.text?.trim())
              .filter(Boolean)
              .join("\n")
              .trim()
            || "";
          if (!text) {
            throw new AIProviderError("Yandex Vision OCR returned empty text", {
              provider: AIProvider.YANDEX,
              code: "EMPTY_RESPONSE",
              retryable: true,
            });
          }

          const latencyMs = Date.now() - startedAt;
          log.info("ai-gateway-yandex-ocr-completed", {
            requestId: request.requestId,
            feature: request.feature,
            provider: AIProvider.YANDEX,
            model: YANDEX_VISION_OCR_MODEL,
            latencyMs,
          });

          return {
            text,
            provider: AIProvider.YANDEX,
            model: YANDEX_VISION_OCR_MODEL,
            finishReason: "TEXT_DETECTED",
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs,
          };
        }

        const response = await fetchImpl(`${baseURL}/completion`, {
          method: "POST",
          headers: {
            Authorization: `Api-Key ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            modelUri: yandexModelUri(folderId, model),
            completionOptions: {
              stream: false,
              ...(request.temperature != null ? { temperature: request.temperature } : {}),
              ...(request.maxTokens != null ? { maxTokens: String(request.maxTokens) } : {}),
            },
            messages: request.messages.map((message) => ({
              role: message.role,
              text: textFromContent(message.content),
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw Object.assign(new Error(`Yandex completion failed with HTTP ${response.status}`), {
            status: response.status,
          });
        }

        const data = await response.json() as YandexCompletionResponse;
        const result = data.result ?? data;
        const alternative = result.alternatives?.[0];
        const text = alternative?.message?.text?.trim() ?? "";
        if (!text) {
          throw new AIProviderError("Yandex returned an empty completion", {
            provider: AIProvider.YANDEX,
            code: "EMPTY_RESPONSE",
            retryable: true,
          });
        }

        const promptTokens = tokenCount(result.usage?.inputTextTokens);
        const completionTokens = tokenCount(result.usage?.completionTokens);
        const totalTokens = tokenCount(result.usage?.totalTokens) || promptTokens + completionTokens;
        const latencyMs = Date.now() - startedAt;

        log.info("ai-gateway-yandex-completed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.YANDEX,
          model,
          modelVersion: result.modelVersion,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          finishReason: alternative?.status,
        });

        return {
          text,
          provider: AIProvider.YANDEX,
          model,
          finishReason: alternative?.status ?? null,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
        };
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        const classified = classifyProviderError(err);
        log.warn("ai-gateway-yandex-failed", {
          requestId: request.requestId,
          feature: request.feature,
          provider: AIProvider.YANDEX,
          model,
          code: classified.code,
          retryable: classified.retryable,
          error: serializeError(err),
        });
        throw new AIProviderError("Yandex completion failed", {
          provider: AIProvider.YANDEX,
          code: classified.code,
          retryable: classified.retryable,
          cause: err,
        });
      } finally {
        clearTimeout(timer);
      }
    },

    async healthcheck(model = defaultModel): Promise<AIProviderHealth> {
      if (!apiKey || !folderId) {
        return {
          provider: AIProvider.YANDEX,
          status: "missing_config",
          model,
          message: "YANDEX_API_KEY or YANDEX_FOLDER_ID is not configured",
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
          maxTokens: 32,
          temperature: 0,
          timeoutMs,
        });
        return {
          provider: AIProvider.YANDEX,
          status: "ok",
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider: AIProvider.YANDEX,
          status: "down",
          model,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : "Yandex healthcheck failed",
        };
      }
    },
  };

  return adapter;
}
