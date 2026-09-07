/**
 * B725 — Генератор маркетинговых изображений с каскадом Google Imagen 3 -> FLUX.1.
 *
 * Приоритет:
 * 1. Google Imagen 3 (imagen-3.0-generate-002) через Gemini/Google Cloud API
 *    (фотореализм, натуральные текстуры, без пластика).
 * 2. Fallback: FLUX.1-schnell через OpenRouter при исчерпании квоты или ошибке Imagen 3.
 *
 * Все сгенерированные изображения обязательно проходят через stripImageMetadata,
 * чтобы очистить C2PA и EXIF метки перед выгрузкой в соцсети.
 */

import { log } from "@/lib/logger";
import { stripImageMetadata } from "@/lib/marketing/image-hygiene";

export type ImageAspectRatio = "1:1" | "4:5" | "16:9";

export interface GenerateImageOptions {
  prompt: string;
  aspectRatio?: ImageAspectRatio;
  fetchImpl?: typeof fetch;
}

export interface GeneratedImageResult {
  buffer: Buffer;
  provider: "imagen-3" | "flux-1";
  mimeType: string;
}

/**
 * Вызов Google Imagen 3 через Generative Language API.
 */
async function callGoogleImagen3(
  prompt: string,
  aspectRatio: ImageAspectRatio = "1:1",
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    log.warn("image-generation.google-imagen.no-api-key");
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio,
          personGeneration: "ALLOW_ADULT",
          outputMimeType: "image/jpeg",
        },
      }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.warn("image-generation.google-imagen.failed", { status: response.status, errorText });
      return null;
    }

    const data = (await response.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string }>;
    };

    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) {
      log.warn("image-generation.google-imagen.empty-prediction");
      return null;
    }

    return Buffer.from(base64, "base64");
  } catch (error) {
    log.warn("image-generation.google-imagen.error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Вызов FLUX.1 через OpenRouter как надежный fallback.
 */
async function callOpenRouterFlux(
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    log.warn("image-generation.openrouter-flux.no-api-key");
    return null;
  }

  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://eterapy.com",
        "X-Title": "ETerapy Marketing",
      },
      body: JSON.stringify({
        prompt,
        model: "black-forest-labs/flux-1-schnell",
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(40_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.warn("image-generation.openrouter-flux.failed", { status: response.status, errorText });
      return null;
    }

    const data = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };

    const first = data.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }

    if (first?.url) {
      const downloadResponse = await fetchImpl(first.url, {
        signal: AbortSignal.timeout(20_000),
      });
      if (downloadResponse.ok) {
        return Buffer.from(await downloadResponse.arrayBuffer());
      }
    }

    log.warn("image-generation.openrouter-flux.empty-response");
    return null;
  } catch (error) {
    log.warn("image-generation.openrouter-flux.error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Основная точка входа для генерации изображений конвейера.
 * Автоматически применяет стриппинг EXIF/C2PA метаданных.
 */
export async function generateMarketingImage(
  options: GenerateImageOptions,
): Promise<GeneratedImageResult | null> {
  const fetchImpl = options.fetchImpl || fetch;
  const aspectRatio = options.aspectRatio || "1:1";

  // 1. Попытка через Google Imagen 3
  const imagenBuffer = await callGoogleImagen3(options.prompt, aspectRatio, fetchImpl);
  if (imagenBuffer) {
    const cleanBuffer = await stripImageMetadata(imagenBuffer);
    return {
      buffer: cleanBuffer,
      provider: "imagen-3",
      mimeType: "image/jpeg",
    };
  }

  // 2. Fallback на OpenRouter FLUX.1
  const fluxBuffer = await callOpenRouterFlux(options.prompt, fetchImpl);
  if (fluxBuffer) {
    const cleanBuffer = await stripImageMetadata(fluxBuffer);
    return {
      buffer: cleanBuffer,
      provider: "flux-1",
      mimeType: "image/png",
    };
  }

  log.error("image-generation.all-providers-failed", { prompt: options.prompt.slice(0, 100) });
  return null;
}
