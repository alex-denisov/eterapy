import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { userHasActiveEntitlement } from "@/lib/entitlements";

const PRODUCT_KEY = "seven-days";

const postSchema = z.object({
  action: z.literal("start"),
  dialogueId: z.string(),
});

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  const results = await db.clarityRoute.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  return jsonWithRequestContext(
    { hasEntitlement, results },
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
  // First day is free, so we don't strictly require payment to START, but let's require it for simplicity in B091 if requested
  if (!hasEntitlement) return errorWithRequestContext("PAYMENT_REQUIRED", "Нужна оплата", 402, context);

  const input = parsed.data;

  // Make sure the dialogue exists and belongs to the user
  const dialogue = await db.dialogue.findFirst({
    where: { id: input.dialogueId, userId },
  });
  if (!dialogue) return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);

  const route = await db.clarityRoute.create({
    data: {
      userId,
      dialogueId: dialogue.id,
      title: "7 дней к ясности",
      status: "ACTIVE",
      currentDay: 1,
    },
  });

  return jsonWithRequestContext({ hasEntitlement, result: route }, { status: 200 }, context);
}
