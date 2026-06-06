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
import { generateDialogueConversationalTurn } from "@/lib/dialogue-clarifier";
import { claimGuestDialoguesForUser } from "@/lib/claim-guest-dialogues";
import { ensureGuestSession, GUEST_SESSION_COOKIE, readGuestSessionId } from "@/lib/guest-session";
import { requestContextFromHeaders } from "@/lib/request-context";
import { markReferralMeaningfulAction } from "@/lib/share-referral";
import { markChannelConversion } from "@/lib/channel-attribution";
import { trackServerEvent } from "@/lib/analytics";
import { checkStandaloneDialogueDailyLimit } from "@/lib/dialogue-limits";

const MAX_DIALOGUES_LIMIT = 50;

const createDialogueSchema = z.object({
  question: z.string().trim().min(3).max(4000),
  topic: z.enum(DIALOGUE_TOPICS).optional(),
  intakeProductKey: z.string().trim().regex(/^[a-z0-9-]+$/).max(80).optional(),
  intakeMode: z.enum(["full", "light"]).optional(),
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
  // B316: if a user logged in mid-flow, claim any orphan dialogues from
  // their guest cookie before we read them. The cookie is cleared below
  // so the sweep runs exactly once per browser.
  const lingeringGuestId = readGuestSessionId(request);
  let guestClaimRan = false;
  if (userId && lingeringGuestId) {
    await claimGuestDialoguesForUser({ userId, guestSessionId: lingeringGuestId });
    guestClaimRan = true;
  }
  const guestSessionId = userId ? null : lingeringGuestId;
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

  const response = jsonWithRequestContext({
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

  // B316: after a successful claim sweep, drop the guest cookie so the
  // sweep does not repeat on every cabinet API call.
  if (guestClaimRan) {
    response.cookies.set(GUEST_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
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
  const intakeProductKey = parsed.data.intakeProductKey ?? null;
  const intakeMode = intakeProductKey ? (parsed.data.intakeMode ?? "full") : null;
  const isProductIntake = Boolean(intakeProductKey);
  if (!isProductIntake) {
    const dailyLimit = await checkStandaloneDialogueDailyLimit({
      request,
      userId,
      guestSessionId: guest?.id ?? null,
    });
    if (!dailyLimit.allowed) {
      const response = jsonWithRequestContext(
        {
          error: dailyLimit.code === "DIALOGUE_DAILY_LIMIT"
            ? "Дневной лимит новых разборов исчерпан."
            : "Слишком много новых разборов за сутки.",
          code: dailyLimit.code,
          audience: dailyLimit.audience,
          limit: dailyLimit.limit,
          used: dailyLimit.used,
          ...(dailyLimit.cta ? { cta: dailyLimit.cta } : {}),
        },
        {
          status: 429,
          headers: dailyLimit.retryAfterSeconds ? { "Retry-After": String(dailyLimit.retryAfterSeconds) } : undefined,
        },
        context,
      );
      const cookie = cookieCarrier.headers.get("set-cookie");
      if (cookie) response.headers.set("set-cookie", cookie);
      if (guest) response.headers.set("X-Guest-Session", guest.created ? "created" : "existing");
      return response;
    }
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
  const shouldAskFirstQuestion = !interrupted && intakeMode !== "light";
  const firstTurn = shouldAskFirstQuestion
    ? await generateDialogueConversationalTurn({
      originalQuestion: parsed.data.question,
      previousPairs: [],
      topic: parsed.data.topic ?? routing.topic,
      difficulty: routing.difficulty,
      safetyLevel: safety.level,
      userId,
      requestId: context.requestId,
    })
    : null;
  const hasFirstQuestion = firstTurn?.type === "question" && firstTurn.question;
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
    ...(hasFirstQuestion && firstTurn ? {
      clarifyingQuestions: {
        source: firstTurn.source,
        provider: firstTurn.provider,
        model: firstTurn.model,
      },
    } : {}),
  };

  const dialogue = await db.dialogue.create({
    data: {
      userId,
      guestSessionId: guest?.id ?? null,
      intakeProductKey,
      intakeMode,
      title,
      status: interrupted ? "SAFETY_INTERRUPTED" : intakeMode === "light" ? "PROCESSING" : "AWAITING_USER",
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
          ...(hasFirstQuestion && firstTurn ? [{
            role: "ASSISTANT" as const,
            content: firstTurn.question!,
            metadata: {
              kind: "clarifying_question",
              chips: firstTurn.chips ?? [],
              source: firstTurn.source,
              provider: firstTurn.provider,
              model: firstTurn.model,
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
      intakeProductKey: true,
      intakeMode: true,
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
      intakeProductKey: dialogue.intakeProductKey,
      intakeMode: dialogue.intakeMode,
      safety: {
        level: safety.level,
        reason: safety.reason,
        interrupt: interrupted,
      },
      clarifyingQuestions: hasFirstQuestion && firstTurn?.question
        ? [{ question: firstTurn.question, chips: firstTurn.chips ?? [] }]
        : [],
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

  trackServerEvent(db, {
    event: "dialogue_created",
    userId,
    sessionId: guest?.id ?? null,
    dialogueId: dialogue.id,
    surface: "api",
  });

  if (userId) {
    void markReferralMeaningfulAction({
      request,
      userId,
      action: "dialogue_created",
      entityId: dialogue.id,
    }).catch(() => {
      // Referral reward bookkeeping must not break the dialogue flow.
    });
    void markChannelConversion({
      request,
      userId,
      conversionType: "dialogue_created",
      conversionId: dialogue.id,
    }).catch(() => {
      // Attribution bookkeeping must not break the dialogue flow.
    });
  }

  return response;
}
