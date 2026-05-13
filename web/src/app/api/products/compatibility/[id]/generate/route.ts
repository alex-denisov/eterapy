import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import { generateCompatibility } from "@/lib/compatibility";
import { buildPairTeaser, dialogueToPrivateText } from "@/lib/social-clarity";

const PRODUCT_KEY = "compatibility";

const postSchema = z.object({
  creatorConsent: z.literal(true),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id } = await params;
  const compatibility = await db.compatibility.findUnique({
    where: { id },
  });

  if (!compatibility) return errorWithRequestContext("NOT_FOUND", "Not found", 404, context);
  if (compatibility.creatorId !== userId) return errorWithRequestContext("FORBIDDEN", "Only creator can generate", 403, context);

  if (
    compatibility.status !== "PARTNER_COMPLETED"
    || !compatibility.partnerConsent
    || !compatibility.creatorConsent
    || !compatibility.creatorDialogueId
    || !compatibility.partnerDialogueId
  ) {
    return errorWithRequestContext("CONFLICT", "Partner has not completed their part", 409, context);
  }
  if (compatibility.riskScore >= 70 || compatibility.riskFlags.includes("toxicity_detected")) {
    return errorWithRequestContext("REVIEW_REQUIRED", "Разбор требует проверки модератором", 409, context);
  }

  const [creatorDialogue, partnerDialogue] = await Promise.all([
    db.dialogue.findFirst({
      where: { id: compatibility.creatorDialogueId, userId: compatibility.creatorId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    db.dialogue.findFirst({
      where: { id: compatibility.partnerDialogueId, userId: compatibility.partnerId ?? undefined },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  const creatorText = dialogueToPrivateText(creatorDialogue);
  const partnerText = dialogueToPrivateText(partnerDialogue);
  if (!creatorText || !partnerText) {
    return errorWithRequestContext("CONFLICT", "Not enough dialogue context", 409, context);
  }

  const teaserText = buildPairTeaser({
    creatorText,
    partnerText,
    relationType: compatibility.type,
  });

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  if (!hasEntitlement) {
    const updated = await db.compatibility.update({
      where: { id },
      data: { teaserText },
    });
    return jsonWithRequestContext(
      { error: teaserText, code: "PAYMENT_REQUIRED", hasEntitlement, result: updated, teaserText },
      { status: 402 },
      context
    );
  }

  const generated = await generateCompatibility({
    creatorId: userId,
    partnerId: compatibility.partnerId!,
    creatorText,
    partnerText,
    type: compatibility.type,
    requestId: context.requestId,
  });

  // Store in ProductResult (so it shares the durable view/export/delete flow)
  const productResult = await db.productResult.create({
    data: {
      userId,
      productKey: PRODUCT_KEY,
      title: "Разбор совместимости",
      status: "READY",
      previewText: teaserText,
      resultText: generated.text,
      metadata: {
        compatibilityId: compatibility.id,
        creatorDialogueId: compatibility.creatorDialogueId,
        partnerDialogueId: compatibility.partnerDialogueId,
        riskScore: compatibility.riskScore,
        riskFlags: compatibility.riskFlags,
        generationMetadata: generated.metadata,
      },
    },
  });

  // Update compatibility record
  const updated = await db.compatibility.update({
    where: { id },
    data: {
      status: "READY",
      creatorConsent: true,
      teaserText,
      reportId: productResult.id,
    },
  });

  return jsonWithRequestContext({ hasEntitlement, result: updated, generated: true }, { status: 200 }, context);
}
