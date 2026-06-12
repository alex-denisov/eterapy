import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import {
  ChatAnalysisInputError,
  buildChatAnalysisPreview,
  buildChatAnalysisTeaser,
  buildChatAnalysisTitle,
  combineRecognizedChatTexts,
  extractChatTextFromScreenshot,
  generateChatAnalysis,
  maskChatAnalysisPii,
} from "@/lib/chat-analysis";

const PRODUCT_KEY = "chat-analysis";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upload_preview"),
    sourceText: z.string().min(10).max(10000),
  }),
  z.object({
    action: z.literal("screenshot_preview"),
    imageDataUrl: z.string().min(100).max(6_000_000),
    fileName: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("screenshots_preview"),
    screenshots: z.array(z.object({
      imageDataUrl: z.string().min(100).max(6_000_000),
      fileName: z.string().max(200).optional(),
    })).min(1).max(10),
  }),
  z.object({
    action: z.literal("generate"),
    id: z.string(),
    contextNote: z.string().max(1200).optional(),
  }),
]);

function serializeResult(result: {
  id: string;
  productKey: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  savedAt: Date | null;
  deletedAt: Date | null;
  metadata: Prisma.JsonValue;
}) {
  const metadata = result.metadata as {
    sourceText?: string | null;
    sourceDeletedAt?: string | null;
    sourceKind?: string | null;
    recognizedText?: string | null;
    piiMasked?: boolean | null;
    screenshot?: { stored?: boolean | null } | null;
    screenshotCount?: number | null;
    recognizedScreenshotCount?: number | null;
  } | null;
  return {
    id: result.id,
    productKey: result.productKey,
    status: result.status,
    title: result.title,
    previewText: result.previewText,
    resultText: result.resultText,
    saved: Boolean(result.savedAt),
    deletedAt: result.deletedAt?.toISOString() ?? null,
    metadata: {
      sourceText: metadata?.sourceDeletedAt ? null : metadata?.sourceText, // Hide source if deleted
      sourceDeletedAt: metadata?.sourceDeletedAt ?? null,
      sourceKind: metadata?.sourceKind ?? "text",
      recognizedText: metadata?.sourceDeletedAt ? null : metadata?.recognizedText ?? null,
      piiMasked: Boolean(metadata?.piiMasked),
      screenshotStored: Boolean(metadata?.screenshot?.stored),
      screenshotCount: metadata?.screenshotCount ?? null,
      recognizedScreenshotCount: metadata?.recognizedScreenshotCount ?? null,
    },
  };
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  const results = await db.productResult.findMany({
    where: { userId, productKey: PRODUCT_KEY, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  return jsonWithRequestContext(
    { hasEntitlement, results: results.map(serializeResult) },
    { status: 200 },
    context
  );
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "product:chat-analysis", 15, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many chat analysis requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  const input = parsed.data;

  if (input.action === "upload_preview") {
    const maskedSourceText = maskChatAnalysisPii(input.sourceText);
    const generated = await generateChatAnalysis({
      sourceText: maskedSourceText,
      userId,
      requestId: context.requestId,
    });
    const previewText = buildChatAnalysisTeaser(maskedSourceText, generated.text) || buildChatAnalysisPreview(maskedSourceText);
    
    // Check if we already have a preview in progress to overwrite or create a new one
    const existing = await db.productResult.findFirst({
      where: { userId, productKey: PRODUCT_KEY, status: "PREVIEW", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const result = existing
      ? await db.productResult.update({
          where: { id: existing.id },
          data: {
            title: buildChatAnalysisTitle(input.sourceText),
            previewText,
            metadata: {
              sourceKind: "text",
              sourceText: maskedSourceText,
              piiMasked: true,
              sourceRawStored: false,
              uploadPreviewedAt: new Date().toISOString(),
              previewGenerationMetadata: generated.metadata,
            },
          },
        })
      : await db.productResult.create({
          data: {
            userId,
            productKey: PRODUCT_KEY,
            title: buildChatAnalysisTitle(input.sourceText),
            status: "PREVIEW",
            previewText,
            metadata: {
              sourceKind: "text",
              sourceText: maskedSourceText,
              piiMasked: true,
              sourceRawStored: false,
              uploadPreviewedAt: new Date().toISOString(),
              previewGenerationMetadata: generated.metadata,
            },
          },
        });

    return jsonWithRequestContext({ hasEntitlement, result: serializeResult(result), generated: false }, { status: 200 }, context);
  }

  if (input.action === "screenshot_preview") {
    try {
      const extraction = await extractChatTextFromScreenshot({
        imageDataUrl: input.imageDataUrl,
        userId,
        requestId: context.requestId,
      });
      const maskedSourceText = maskChatAnalysisPii(extraction.recognizedText);
      const generated = await generateChatAnalysis({
        sourceText: maskedSourceText,
        userId,
        requestId: context.requestId,
      });
      const previewText = buildChatAnalysisTeaser(maskedSourceText, generated.text) || buildChatAnalysisPreview(maskedSourceText);

      const existing = await db.productResult.findFirst({
        where: { userId, productKey: PRODUCT_KEY, status: "PREVIEW", deletedAt: null },
        orderBy: { createdAt: "desc" },
      });

      const metadata = {
        sourceKind: "screenshot",
        sourceText: maskedSourceText,
        recognizedText: maskedSourceText,
        piiMasked: true,
        sourceRawStored: false,
        imageStored: false,
        fileName: input.fileName ?? null,
        uploadPreviewedAt: new Date().toISOString(),
        ocr: extraction.metadata,
        previewGenerationMetadata: generated.metadata,
      };

      const result = existing
        ? await db.productResult.update({
            where: { id: existing.id },
            data: {
              title: buildChatAnalysisTitle(maskedSourceText),
              previewText,
              metadata,
            },
          })
        : await db.productResult.create({
            data: {
              userId,
              productKey: PRODUCT_KEY,
              title: buildChatAnalysisTitle(maskedSourceText),
              status: "PREVIEW",
              previewText,
              metadata,
            },
          });

      return jsonWithRequestContext({ hasEntitlement, result: serializeResult(result), generated: false }, { status: 200 }, context);
    } catch (error) {
      if (error instanceof ChatAnalysisInputError) {
        return errorWithRequestContext(error.code, error.message, 400, context);
      }
      throw error;
    }
  }

  if (input.action === "screenshots_preview") {
    const ocrItems: Prisma.InputJsonObject[] = [];
    const recognizedFragments: string[] = [];

    for (const screenshotInput of input.screenshots) {
      try {
        const extraction = await extractChatTextFromScreenshot({
          imageDataUrl: screenshotInput.imageDataUrl,
          userId,
          requestId: context.requestId,
        });
        recognizedFragments.push(extraction.recognizedText);
        ocrItems.push({
          fileName: screenshotInput.fileName ?? null,
          ok: true,
          metadata: extraction.metadata,
        });
      } catch (error) {
        if (error instanceof ChatAnalysisInputError) {
          ocrItems.push({
            fileName: screenshotInput.fileName ?? null,
            ok: false,
            code: error.code,
          });
          continue;
        }
        throw error;
      }
    }

    const recognizedText = combineRecognizedChatTexts(recognizedFragments);
    if (recognizedText.length < 10) {
      return errorWithRequestContext(
        "OCR_TEXT_TOO_SHORT",
        "Не удалось распознать достаточно текста. Попробуйте другие скриншоты или вставьте текст вручную",
        400,
        context,
      );
    }

    const maskedSourceText = maskChatAnalysisPii(recognizedText);
    const generated = await generateChatAnalysis({
      sourceText: maskedSourceText,
      userId,
      requestId: context.requestId,
    });
    const previewText = buildChatAnalysisTeaser(maskedSourceText, generated.text) || buildChatAnalysisPreview(maskedSourceText);

    const existing = await db.productResult.findFirst({
      where: { userId, productKey: PRODUCT_KEY, status: "PREVIEW", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const metadata = {
      sourceKind: "screenshots",
      sourceText: maskedSourceText,
      recognizedText: maskedSourceText,
      piiMasked: true,
      sourceRawStored: false,
      imageStored: false,
      screenshotCount: input.screenshots.length,
      recognizedScreenshotCount: recognizedFragments.length,
      uploadPreviewedAt: new Date().toISOString(),
      ocrItems,
      previewGenerationMetadata: generated.metadata,
    };

    const result = existing
      ? await db.productResult.update({
          where: { id: existing.id },
          data: {
            title: buildChatAnalysisTitle(maskedSourceText),
            previewText,
            metadata,
          },
        })
      : await db.productResult.create({
          data: {
            userId,
            productKey: PRODUCT_KEY,
            title: buildChatAnalysisTitle(maskedSourceText),
            status: "PREVIEW",
            previewText,
            metadata,
          },
        });

    return jsonWithRequestContext({ hasEntitlement, result: serializeResult(result), generated: false }, { status: 200 }, context);
  }

  if (input.action === "generate") {
    if (!hasEntitlement) return errorWithRequestContext("PAYMENT_REQUIRED", "Нужна оплата", 402, context);

    const resultRecord = await db.productResult.findFirst({
      where: { id: input.id, userId, productKey: PRODUCT_KEY, deletedAt: null },
    });
    
    if (!resultRecord) return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);
    
    const metadata = resultRecord.metadata as { sourceText?: string | null } | null;
    const sourceText = metadata?.sourceText;
    
    if (!sourceText) return errorWithRequestContext("VALIDATION_ERROR", "No source text found to analyze", 400, context);

    const generated = await generateChatAnalysis({
      sourceText,
      contextNote: input.contextNote,
      userId,
      requestId: context.requestId,
    });

    // B320: автосохранение в кабинет для залогиненного пользователя — любой
    // готовый разбор сразу попадает в Мою карту. Пользователь всё ещё может
    // отозвать его кнопкой "Удалить разбор".
    const updated = await db.productResult.update({
      where: { id: resultRecord.id },
      data: {
        status: "READY",
        resultText: generated.text,
        savedAt: resultRecord.savedAt ?? new Date(),
        metadata: {
          ...(metadata ?? {}),
          analysisContextNote: input.contextNote ?? null,
          generationMetadata: generated.metadata,
          generationConfirmedAt: new Date().toISOString(),
          autoSavedAt: resultRecord.savedAt ? null : new Date().toISOString(),
        },
      },
    });

    return jsonWithRequestContext({ hasEntitlement, result: serializeResult(updated), generated: true }, { status: 200 }, context);
  }

  return errorWithRequestContext("VALIDATION_ERROR", "Unknown action", 400, context);
}
