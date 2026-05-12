import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import { inviteExpiryDate } from "@/lib/social-clarity";

const PRODUCT_KEY = "compatibility";

const postSchema = z.object({
  action: z.literal("create_invite"),
  dialogueId: z.string(),
  type: z.enum(["romantic", "friendship", "business", "family"]),
});

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  
  // Find incomplete compatibilities
  const result = await db.compatibility.findFirst({
    where: { creatorId: userId, status: { in: ["CREATED", "INVITED", "PARTNER_COMPLETED"] } },
    orderBy: { createdAt: "desc" },
  });

  return jsonWithRequestContext(
    { hasEntitlement, result },
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

  // Make sure the dialogue exists and belongs to the user
  const dialogue = await db.dialogue.findFirst({
    where: { id: input.dialogueId, userId },
  });
  if (!dialogue) return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);

  const compatibility = await db.compatibility.create({
    data: {
      creatorId: userId,
      type: input.type,
      status: "INVITED",
      creatorDialogueId: input.dialogueId,
      inviteExpiresAt: inviteExpiryDate(7),
      creatorConsent: true,
    },
  });

  return jsonWithRequestContext({ hasEntitlement, result: compatibility }, { status: 200 }, context);
}
