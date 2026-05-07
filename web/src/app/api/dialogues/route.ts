import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { authRateLimitKey, checkAuthRateLimit, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { classifyDialogueQuestion, DIALOGUE_TOPICS } from "@/lib/dialogue-router";
import { classifyDialogueSafety, shouldInterruptDialogue } from "@/lib/dialogue-safety";
import { generateDialogueClarifyingQuestions } from "@/lib/dialogue-clarifier";
import { ensureGuestSession, readGuestSessionId } from "@/lib/guest-session";
import { requestContextFromHeaders } from "@/lib/request-context";
import { markReferralMeaningfulAction } from "@/lib/share-referral";

const MAX_DIALOGUES_LIMIT = 50;

const createDialogueSchema = z.object({
  question: z.string().trim().min(3).max(4000),
  topic: z.enum(DIALOGUE_TOPICS).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function titleFromQuestion(question: string) {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > 96 ? `${oneLine.slice(0, 93)}...` : oneLine;
}

function parseLimit(request: NextRequest) {
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  if (!Number.isFinite(rawLimit) || rawLimit < 1) return 20;
  return Math.min(Math.floor(rawLimit), MAX_DIALOGUES_LIMIT);
}

function ownerWhere(userId: string | null, guestSessionId: string | null) {
  if (userId) return { userId };
  if (guestSessionId) return { guestSessionId };
  return null;
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const guestSessionId = userId ? null : readGuestSessionId(request);
  const whereOwner = ownerWhere(userId, guestSessionId);

  if (!whereOwner) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = parseLimit(request);

  const dialogues = await db.dialogue.findMany({
    where: {
      ...whereOwner,
      deletedAt: null,
    },
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      status: true,
      topic: true,
      difficulty: true,
      safetyLevel: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  const page = dialogues.slice(0, limit);
  const nextCursor = dialogues.length > limit ? page.at(-1)?.id ?? null : null;

  return jsonWithRequestContext({
    dialogues: page.map((dialogue) => ({
      id: dialogue.id,
      title: dialogue.title,
      status: dialogue.status,
      topic: dialogue.topic,
      difficulty: dialogue.difficulty,
      safetyLevel: dialogue.safetyLevel,
      createdAt: dialogue.createdAt.toISOString(),
      updatedAt: dialogue.updatedAt.toISOString(),
      messageCount: dialogue._count.messages,
    })),
    nextCursor,
  }, { status: 200 }, context);
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "dialogue:create", 30, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many dialogue requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const parsed = createDialogueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Invalid dialogue payload", 400, context);
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const cookieCarrier = NextResponse.json({});
  const guest = userId ? null : ensureGuestSession(request, cookieCarrier);
  const ownerValue = userId ?? guest?.id;
  if (!ownerValue) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }
  const ownerKey = userId
    ? authRateLimitKey("dialogue:create:user", ownerValue)
    : authRateLimitKey("dialogue:create:guest", ownerValue);
  const ownerLimit = checkAuthRateLimit(ownerKey, 20, 60 * 60_000);
  if (!ownerLimit.allowed) {
    const response = jsonWithRequestContext(
      { error: "Too many dialogue requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ownerLimit.retryAfterSeconds) } },
      context,
    );
    const cookie = cookieCarrier.headers.get("set-cookie");
    if (cookie) response.headers.set("set-cookie", cookie);
    if (guest) response.headers.set("X-Guest-Session", guest.created ? "created" : "existing");
    return response;
  }
  const title = titleFromQuestion(parsed.data.question);
  const [routing, safety] = await Promise.all([
    classifyDialogueQuestion({
      question: parsed.data.question,
      userId,
      requestId: context.requestId,
    }),
    classifyDialogueSafety({
      question: parsed.data.question,
      userId,
      requestId: context.requestId,
    }),
  ]);
  const interrupted = shouldInterruptDialogue(safety.level);
  const clarifier = interrupted ? null : await generateDialogueClarifyingQuestions({
    question: parsed.data.question,
    topic: parsed.data.topic ?? routing.topic,
    difficulty: routing.difficulty,
    safetyLevel: safety.level,
    userId,
    requestId: context.requestId,
  });
  const metadata = {
    ...parsed.data.metadata,
    routing: {
      topic: routing.topic,
      difficulty: routing.difficulty,
      confidence: routing.confidence,
      source: routing.source,
      provider: routing.provider,
      model: routing.model,
    },
    safety: {
      level: safety.level,
      reason: safety.reason,
      confidence: safety.confidence,
      source: safety.source,
      provider: safety.provider,
      model: safety.model,
    },
    ...(clarifier ? {
      clarifyingQuestions: {
        questions: clarifier.questions,
        source: clarifier.source,
        provider: clarifier.provider,
        model: clarifier.model,
      },
    } : {}),
  };

  const dialogue = await db.dialogue.create({
    data: {
      userId,
      guestSessionId: guest?.id ?? null,
      title,
      status: interrupted ? "SAFETY_INTERRUPTED" : "AWAITING_USER",
      topic: parsed.data.topic ?? routing.topic,
      difficulty: routing.difficulty,
      safetyLevel: safety.level,
      metadata: metadata as Prisma.InputJsonObject,
      messages: {
        create: [
          {
            role: "USER",
            content: parsed.data.question,
          },
          ...(clarifier ? [{
            role: "ASSISTANT" as const,
            content: clarifier.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"),
            metadata: {
              kind: "clarifying_questions",
              questions: clarifier.questions,
              source: clarifier.source,
              provider: clarifier.provider,
              model: clarifier.model,
            } as Prisma.InputJsonObject,
          }] : []),
        ],
      },
    },
    select: {
      id: true,
      title: true,
      status: true,
      topic: true,
      difficulty: true,
      safetyLevel: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });

  const response = jsonWithRequestContext({
    dialogue: {
      id: dialogue.id,
      title: dialogue.title,
      status: dialogue.status,
      topic: dialogue.topic,
      difficulty: dialogue.difficulty,
      safetyLevel: dialogue.safetyLevel,
      safety: {
        level: safety.level,
        reason: safety.reason,
        interrupt: interrupted,
      },
      clarifyingQuestions: clarifier?.questions ?? [],
      createdAt: dialogue.createdAt.toISOString(),
      updatedAt: dialogue.updatedAt.toISOString(),
      messages: dialogue.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    },
  }, { status: 201 }, context);

  const cookie = cookieCarrier.headers.get("set-cookie");
  if (cookie) response.headers.set("set-cookie", cookie);
  if (guest) response.headers.set("X-Guest-Session", guest.created ? "created" : "existing");

  if (userId) {
    void markReferralMeaningfulAction({
      request,
      userId,
      action: "dialogue_created",
      entityId: dialogue.id,
    }).catch(() => {
      // Referral reward bookkeeping must not break the dialogue flow.
    });
  }

  return response;
}
