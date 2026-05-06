import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import { buildChatAnalysisPreview, buildChatAnalysisTitle, generateChatAnalysis } from "@/lib/chat-analysis";

const PRODUCT_KEY = "chat-analysis";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upload_preview"),
    sourceText: z.string().min(10).max(10000),
  }),
  z.object({
    action: z.literal("generate"),
    id: z.string(),
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
  const metadata = result.metadata as { sourceText?: string | null; sourceDeletedAt?: string | null } | null;
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
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  const input = parsed.data;

  if (input.action === "upload_preview") {
    // Basic anonymization for preview
    const previewText = buildChatAnalysisPreview(input.sourceText);
    
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
            metadata: { sourceText: input.sourceText },
          },
        })
      : await db.productResult.create({
          data: {
            userId,
            productKey: PRODUCT_KEY,
            title: buildChatAnalysisTitle(input.sourceText),
            status: "PREVIEW",
            previewText,
            metadata: { sourceText: input.sourceText },
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
      userId,
      requestId: context.requestId,
    });

    const updated = await db.productResult.update({
      where: { id: resultRecord.id },
      data: {
        status: "READY",
        resultText: generated.text,
        metadata: {
          ...(metadata ?? {}),
          generationMetadata: generated.metadata,
        },
      },
    });

    return jsonWithRequestContext({ hasEntitlement, result: serializeResult(updated), generated: true }, { status: 200 }, context);
  }

  return errorWithRequestContext("VALIDATION_ERROR", "Unknown action", 400, context);
}
