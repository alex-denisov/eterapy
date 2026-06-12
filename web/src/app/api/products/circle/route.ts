import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { inviteExpiryDate } from "@/lib/social-clarity";
import { userHasActiveEntitlement } from "@/lib/entitlements";
import { requestFingerprint } from "@/lib/antifraud";
import { OUTSIDE_VIEW_FRAMING, generateOutsideViewQuestions } from "@/lib/together";

const PRODUCT_KEY = "circle";

// Legacy circle (free-form question shown to invitees) — kept for any in-flight
// invites; the standalone circle product is closed in B385.
const createCircleSchema = z.object({
  action: z.literal("create_circle"),
  question: z.string().trim().min(10).max(1200),
  topic: z.string().trim().max(80).optional(),
});

// B385 scenario A — «Взгляд со стороны». The private situation is sent only to
// the generator; invitees see the neutral generated questions, never the text.
const createOutsideSchema = z.object({
  action: z.literal("create_outside"),
  situation: z.string().trim().min(10).max(4000),
  topic: z.string().trim().max(80).optional(),
});

const postSchema = z.discriminatedUnion("action", [createCircleSchema, createOutsideSchema]);

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

  const fingerprint = requestFingerprint(request);
  const data = parsed.data;
  const isOutside = data.action === "create_outside";

  // For outside-view, the question field carries only the neutral framing; the
  // private situation never leaves the generator boundary.
  const question = data.action === "create_outside" ? OUTSIDE_VIEW_FRAMING : data.question;
  const generated =
    data.action === "create_outside"
      ? await generateOutsideViewQuestions({
          situation: data.situation,
          userId,
          requestId: context.requestId,
        })
      : null;

  const circle = await db.clarityCircle.create({
    data: {
      creatorId: userId,
      question,
      topic: parsed.data.topic,
      inviteExpiresAt: inviteExpiryDate(7),
      creatorIpHash: fingerprint.ipHash,
      creatorUserAgentHash: fingerprint.userAgentHash,
      creatorDeviceHash: fingerprint.deviceHash,
      metadata: isOutside
        ? {
            entry: "together",
            mode: "outside",
            version: "v5-b385",
            outsideQuestions: generated!.questions,
            questionSource: generated!.source,
          }
        : {
            entry: "circle",
            version: "v4.1",
          },
    },
    include: { participants: true },
  });

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  return jsonWithRequestContext({ hasEntitlement, result: circle }, { status: 200 }, context);
}
