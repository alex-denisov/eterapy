import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import { generateCompatibility } from "@/lib/compatibility";

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

  // Both consents required (B089)
  if (compatibility.status !== "PARTNER_COMPLETED" || !compatibility.partnerConsent) {
    return errorWithRequestContext("CONFLICT", "Partner has not completed their part", 409, context);
  }

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  if (!hasEntitlement) return errorWithRequestContext("PAYMENT_REQUIRED", "Нужна оплата", 402, context);

  // Here we would fetch both dialogues. Since we didn't store dialogueId, we'll use placeholder text for now.
  const creatorText = "Creator perspective text placeholder";
  const partnerText = "Partner perspective text placeholder";

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
      resultText: generated.text,
      metadata: {
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
      reportId: productResult.id,
    },
  });

  return jsonWithRequestContext({ hasEntitlement, result: updated, generated: true }, { status: 200 }, context);
}
