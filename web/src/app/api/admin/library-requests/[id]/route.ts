import { NextRequest, NextResponse } from "next/server";
import { DialogueMessageRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getUserPermissions } from "@/lib/moderator-permissions";

const VALID_STATUSES = ["PENDING_REVIEW", "PUBLISHED", "WITHDRAWN"] as const;
type LibraryStatus = (typeof VALID_STATUSES)[number];

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? undefined;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN", "MODERATOR"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const permissions = await getUserPermissions(session.user.id, role);
  if (role !== "ADMIN" && role !== "SUPERADMIN" && !permissions.includes("library.moderate")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = body as { status?: unknown; title?: unknown; question?: unknown };
  const status = payload.status;
  const nextStatus = typeof status === "string" ? status as LibraryStatus : null;
  const nextTitle = typeof payload.title === "string" ? payload.title.trim() : null;
  const nextQuestion = typeof payload.question === "string" ? payload.question.trim() : null;
  if (typeof status !== "undefined" && (!nextStatus || !VALID_STATUSES.includes(nextStatus))) {
    return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
  }
  if (!nextStatus && nextTitle == null && nextQuestion == null) {
    return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
  }
  if ((nextTitle != null && nextTitle.length === 0) || (nextQuestion != null && nextQuestion.length === 0)) {
    return NextResponse.json({ error: "Заголовок и вопрос не могут быть пустыми" }, { status: 400 });
  }

  const { id } = await params;
  const dialogue = await db.dialogue.findUnique({
    where: { id },
    select: { id: true, userId: true, libraryStatus: true, libraryConsentAt: true, title: true },
  });
  if (!dialogue) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  if (nextStatus === "PUBLISHED" && !dialogue.libraryConsentAt) {
    return NextResponse.json({ error: "Нет согласия пользователя на публикацию" }, { status: 422 });
  }

  await db.$transaction(async (tx) => {
    await tx.dialogue.update({
      where: { id },
      data: {
        ...(nextTitle != null ? { title: nextTitle } : {}),
        ...(nextStatus ? {
          libraryStatus: nextStatus,
          libraryConsentAt: nextStatus === "WITHDRAWN" ? null : dialogue.libraryConsentAt,
        } : {}),
      },
    });
    if (nextQuestion != null) {
      const firstUserMessage = await tx.dialogueMessage.findFirst({
        where: { dialogueId: id, role: DialogueMessageRole.USER },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (firstUserMessage) {
        await tx.dialogueMessage.update({
          where: { id: firstUserMessage.id },
          data: { content: nextQuestion },
        });
      } else {
        await tx.dialogueMessage.create({
          data: { dialogueId: id, role: DialogueMessageRole.USER, content: nextQuestion },
        });
      }
    }
  });
  await logAudit(
    session.user.id,
    "LIBRARY_MODERATE",
    dialogue.userId ?? id,
    JSON.stringify({
      dialogueId: id,
      from: dialogue.libraryStatus,
      to: nextStatus ?? dialogue.libraryStatus,
      titleChanged: nextTitle != null && nextTitle !== dialogue.title,
      questionChanged: nextQuestion != null,
    }),
    clientIp(request),
  );

  return NextResponse.json({ ok: true, status: nextStatus ?? dialogue.libraryStatus });
}
