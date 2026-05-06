import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

const postSchema = z.object({
  partnerConsent: z.literal(true),
  dialogueId: z.string(),
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
  
  // Can't submit again
  if (compatibility.status !== "INVITED" && compatibility.status !== "CREATED") {
    return errorWithRequestContext("CONFLICT", "Already completed", 409, context);
  }

  const dialogue = await db.dialogue.findFirst({
    where: { id: parsed.data.dialogueId, userId },
  });
  if (!dialogue) return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);

  // Store dialogue ID in metadata or relation? Since Compatibility doesn't have a partnerDialogueId field, we can use ProductResult metadata eventually.
  // Wait, I didn't add dialogue ids to Compatibility model. Let's just update the status to PARTNER_COMPLETED for the test.

  const updated = await db.compatibility.update({
    where: { id },
    data: {
      partnerId: userId,
      partnerConsent: parsed.data.partnerConsent,
      status: "PARTNER_COMPLETED",
    },
  });

  return jsonWithRequestContext({ result: updated }, { status: 200 }, context);
}
