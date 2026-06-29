import { NextRequest, NextResponse } from "next/server";
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
  const status = (body as { status?: unknown }).status;
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as LibraryStatus)) {
    return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
  }

  const { id } = await params;
  const dialogue = await db.dialogue.findUnique({
    where: { id },
    select: { id: true, userId: true, libraryStatus: true, libraryConsentAt: true },
  });
  if (!dialogue) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  if (status === "PUBLISHED" && !dialogue.libraryConsentAt) {
    return NextResponse.json({ error: "Нет согласия пользователя на публикацию" }, { status: 422 });
  }

  await db.dialogue.update({
    where: { id },
    data: {
      libraryStatus: status,
      libraryConsentAt: status === "WITHDRAWN" ? null : dialogue.libraryConsentAt,
    },
  });
  await logAudit(
    session.user.id,
    "LIBRARY_MODERATE",
    dialogue.userId ?? id,
    JSON.stringify({ dialogueId: id, from: dialogue.libraryStatus, to: status }),
    clientIp(request),
  );

  return NextResponse.json({ ok: true, status });
}
