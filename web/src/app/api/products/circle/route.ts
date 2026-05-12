import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { inviteExpiryDate } from "@/lib/social-clarity";
import { userHasActiveEntitlement } from "@/lib/entitlements";

const PRODUCT_KEY = "circle";

const postSchema = z.object({
  action: z.literal("create_circle"),
  question: z.string().trim().min(10).max(1200),
  topic: z.string().trim().max(80).optional(),
});

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const [hasEntitlement, circles] = await Promise.all([
    userHasActiveEntitlement(userId, PRODUCT_KEY),
    db.clarityCircle.findMany({
      where: { creatorId: userId, status: { not: "DELETED" } },
      include: { participants: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return jsonWithRequestContext({ hasEntitlement, results: circles, result: circles[0] ?? null }, { status: 200 }, context);
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const circle = await db.clarityCircle.create({
    data: {
      creatorId: userId,
      question: parsed.data.question,
      topic: parsed.data.topic,
      inviteExpiresAt: inviteExpiryDate(7),
      metadata: {
        entry: "circle",
        version: "v4.1",
      },
    },
    include: { participants: true },
  });

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  return jsonWithRequestContext({ hasEntitlement, result: circle }, { status: 200 }, context);
}
