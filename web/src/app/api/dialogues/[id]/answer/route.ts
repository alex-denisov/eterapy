import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { generateDialoguePrimaryAnswer } from "@/lib/dialogue-primary-answer";
import { readGuestSessionId } from "@/lib/guest-session";
import { requestContextFromHeaders } from "@/lib/request-context";
import { trackServerEvent } from "@/lib/analytics";

function ownerWhere(userId: string | null, guestSessionId: string | null) {
  if (userId) return { userId };
  if (guestSessionId) return { guestSessionId };
  return null;
}

function isPrimaryAnswerMessage(message: { role: string; metadata: Prisma.JsonValue | null }) {
  return message.role === "ASSISTANT"
    && typeof message.metadata === "object"
    && message.metadata !== null
    && !Array.isArray(message.metadata)
    && (message.metadata as { kind?: unknown }).kind === "primary_answer";
}

function serializeDialogue(dialogue: {
  id: string;
  title: string;
  status: string;
  topic: string | null;
  difficulty: string | null;
  safetyLevel: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
}) {
  const primaryAnswer = [...dialogue.messages].reverse().find(isPrimaryAnswerMessage) ?? null;
  return {
    id: dialogue.id,
    title: dialogue.title,
    status: dialogue.status,
    topic: dialogue.topic,
    difficulty: dialogue.difficulty,
    safetyLevel: dialogue.safetyLevel,
    createdAt: dialogue.createdAt.toISOString(),
    updatedAt: dialogue.updatedAt.toISOString(),
    messages: dialogue.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
    primaryAnswer: primaryAnswer ? {
      id: primaryAnswer.id,
      content: primaryAnswer.content,
      metadata: primaryAnswer.metadata,
      createdAt: primaryAnswer.createdAt.toISOString(),
    } : null,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "dialogue:answer", 20, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many answer requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const guestSessionId = userId ? null : readGuestSessionId(request);
  const whereOwner = ownerWhere(userId, guestSessionId);

  if (!whereOwner) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const { id } = await params;
  const dialogue = await db.dialogue.findFirst({
    where: {
      id,
      ...whereOwner,
      deletedAt: null,
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
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

  if (!dialogue) {
    return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);
  }
  if (dialogue.status === "SAFETY_INTERRUPTED") {
    return errorWithRequestContext("CONFLICT", "Dialogue was interrupted for safety", 409, context);
  }
  if (dialogue.status === "ANSWERED") {
    return jsonWithRequestContext({
      dialogue: serializeDialogue(dialogue),
      generated: false,
    }, { status: 200 }, context);
  }
  if (dialogue.status !== "PROCESSING") {
    return errorWithRequestContext("CONFLICT", "Dialogue is not ready for primary answer", 409, context);
  }

  const answer = await generateDialoguePrimaryAnswer({
    topic: dialogue.topic,
    difficulty: dialogue.difficulty,
    safetyLevel: dialogue.safetyLevel,
    userId,
    requestId: context.requestId,
    messages: dialogue.messages.map((message) => ({
      role: message.role as "USER" | "ASSISTANT" | "SYSTEM",
      content: message.content,
    })),
  });

  const updated = await db.dialogue.update({
    where: { id: dialogue.id },
    data: {
      status: "ANSWERED",
      messages: {
        create: {
          role: "ASSISTANT",
          content: answer.text,
          metadata: {
            kind: "primary_answer",
            source: answer.source,
            provider: answer.provider,
            model: answer.model,
            tokensIn: answer.tokensIn,
            tokensOut: answer.tokensOut,
            latencyMs: answer.latencyMs,
          } as Prisma.InputJsonObject,
        },
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
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

  trackServerEvent(db, {
    event: "primary_answer_generated",
    userId,
    sessionId: guestSessionId,
    dialogueId: dialogue.id,
    surface: "api",
  });

  return jsonWithRequestContext({
    dialogue: serializeDialogue(updated),
    generated: true,
  }, { status: 200 }, context);
}
