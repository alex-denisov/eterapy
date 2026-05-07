import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { createSafeShareLink, normalizeShareText, shareLandingUrl } from "@/lib/share-referral";
import { requestContextFromHeaders } from "@/lib/request-context";

const createShareSchema = z.object({
  sourceType: z.string().trim().min(2).max(48).default("insight"),
  sourceId: z.string().trim().max(128).optional().nullable(),
  sourceLabel: z.string().trim().max(80).optional().nullable(),
  topic: z.string().trim().max(120).optional().nullable(),
  previewText: z.string().trim().max(1200).optional().nullable(),
  hideQuestion: z.boolean().optional(),
  showWatermark: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const parsed = createShareSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Invalid share payload", 400, context);
  }

  const session = await auth();
  const share = await createSafeShareLink({
    ownerUserId: session?.user?.id ?? null,
    sourceType: parsed.data.sourceType,
    sourceId: parsed.data.sourceId ?? null,
    sourceLabel: parsed.data.sourceLabel ?? null,
    topic: parsed.data.topic ?? null,
    previewText: normalizeShareText(
      parsed.data.previewText,
      "Я могу остановиться, услышать себя и выбрать следующий маленький шаг.",
    ),
    hideQuestion: parsed.data.hideQuestion ?? true,
    showWatermark: parsed.data.showWatermark ?? true,
  });

  return jsonWithRequestContext({
    share: {
      token: share.token,
      url: shareLandingUrl(share.token, share.sourceType, share.topic),
      previewText: share.previewText,
      anonymized: share.hideQuestion,
      watermark: share.showWatermark,
    },
  }, { status: 201 }, context);
}
