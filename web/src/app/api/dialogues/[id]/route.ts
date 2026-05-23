import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { readGuestSessionId } from "@/lib/guest-session";
import { requestContextFromHeaders } from "@/lib/request-context";
import { generateDialogueConversationalTurn } from "@/lib/dialogue-clarifier";

const respondDialogueSchema = z.object({
  message: z.string().trim().min(1).max(4000).optional(),
  action: z.enum(["skip_clarifications"]).optional(),
}).refine((value) => Boolean(value.message || value.action), {
  message: "message or action is required",
});

function ownerWhere(userId: string | null, guestSessionId: string | null) {
  if (userId) return { userId };
  if (guestSessionId) return { guestSessionId };
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
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
          createdAt: true,
        },
      },
    },
  });

  if (!dialogue) {
    return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);
  }

  return jsonWithRequestContext({
    dialogue: {
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
    },
  }, { status: 200 }, context);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const ipLimit = checkRequestAuthRateLimit(request, "dialogue:respond", 60, 5 * 60_000);
  if (!ipLimit.allowed) {
    return jsonWithRequestContext(
      { error: "Too many dialogue responses", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      context,
    );
  }

  const parsed = respondDialogueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Invalid dialogue response payload", 400, context);
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
    select: { id: true, status: true, topic: true, difficulty: true, safetyLevel: true },
  });

  if (!dialogue) {
    return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);
  }
  if (dialogue.status !== "AWAITING_USER") {
    return errorWithRequestContext("CONFLICT", "Dialogue is not awaiting clarification", 409, context);
  }

  const skipped = parsed.data.action === "skip_clarifications";
  const content = skipped ? "Пропустить уточнения" : parsed.data.message!;

  // Save user message first
  await db.dialogue.update({
    where: { id: dialogue.id },
    data: {
      messages: {
        create: {
          role: "USER",
          content,
          metadata: {
            kind: skipped ? "clarification_skip" : "clarification_answer",
            skipped,
          } as Prisma.InputJsonObject,
        },
      },
    },
  });

  if (!skipped) {
    // Load full conversation to decide next turn
    const fullHistory = await db.dialogue.findFirst({
      where: { id: dialogue.id },
      select: {
        messages: { orderBy: { createdAt: "asc" }, select: { role: true, content: true } },
      },
    });

    const allMessages = fullHistory?.messages ?? [];
    const originalQuestion = allMessages[0]?.content ?? content;
    const previousPairs: Array<{ question: string; answer: string }> = [];
    let pendingQuestion: string | null = null;

    for (let i = 1; i < allMessages.length; i++) {
      const msg = allMessages[i];
      if (msg.role === "ASSISTANT") {
        pendingQuestion = msg.content;
      } else if (msg.role === "USER" && pendingQuestion !== null) {
        previousPairs.push({ question: pendingQuestion, answer: msg.content });
        pendingQuestion = null;
      }
    }

    const turn = await generateDialogueConversationalTurn({
      originalQuestion,
      previousPairs,
      topic: dialogue.topic,
      difficulty: dialogue.difficulty,
      safetyLevel: dialogue.safetyLevel,
      userId,
      requestId: context.requestId,
    });

    if (turn.type === "question" && turn.question) {
      await db.dialogue.update({
        where: { id: dialogue.id },
        data: {
          messages: {
            create: {
              role: "ASSISTANT",
              content: turn.question,
              metadata: {
                kind: "clarifying_question",
                chips: turn.chips ?? [],
                source: turn.source,
                provider: turn.provider,
                model: turn.model,
              } as Prisma.InputJsonObject,
            },
          },
        },
      });

      const withQuestion = await db.dialogue.findFirst({
        where: { id: dialogue.id },
        select: {
          id: true, title: true, status: true, topic: true, difficulty: true, safetyLevel: true,
          createdAt: true, updatedAt: true,
          messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, createdAt: true } },
        },
      });

      return jsonWithRequestContext({
        dialogue: {
          id: withQuestion!.id, title: withQuestion!.title, status: withQuestion!.status,
          topic: withQuestion!.topic, difficulty: withQuestion!.difficulty, safetyLevel: withQuestion!.safetyLevel,
          createdAt: withQuestion!.createdAt.toISOString(), updatedAt: withQuestion!.updatedAt.toISOString(),
          messages: withQuestion!.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
        },
        nextQuestion: { question: turn.question, chips: turn.chips ?? [] },
      }, { status: 200 }, context);
    }
  }

  // Ready or skip-all → transition to PROCESSING
  const updated = await db.dialogue.update({
    where: { id: dialogue.id },
    data: { status: "PROCESSING" },
    select: {
      id: true, title: true, status: true, topic: true, difficulty: true, safetyLevel: true,
      createdAt: true, updatedAt: true,
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, createdAt: true } },
    },
  });

  return jsonWithRequestContext({
    dialogue: {
      id: updated.id, title: updated.title, status: updated.status,
      topic: updated.topic, difficulty: updated.difficulty, safetyLevel: updated.safetyLevel,
      createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(),
      messages: updated.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
    },
  }, { status: 200 }, context);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
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
    select: { id: true },
  });

  if (!dialogue) {
    return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);
  }

  await db.dialogue.update({
    where: { id: dialogue.id },
    data: {
      status: "DELETED",
      deletedAt: new Date(),
    },
  });

  return jsonWithRequestContext({ ok: true }, { status: 200 }, context);
}
