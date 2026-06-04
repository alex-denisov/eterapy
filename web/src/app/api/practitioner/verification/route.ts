import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { makePractitionerVerificationMarker, PRACTITIONER_VERIFICATION_PREFIX } from "@/lib/practitioner-verification";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session.user?.role !== "PRACTITIONER") {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const payload = await request.json().catch(() => ({})) as { note?: unknown; portfolio?: unknown; attachments?: unknown };
  const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 2000) : "";
  const portfolio = typeof payload.portfolio === "string" ? payload.portfolio.trim().slice(0, 500) : "";
  // Y5: uploaded document URLs (from /api/files, kind=DOCUMENT). Keep only
  // same-origin /uploads/* paths so the field can't store arbitrary links.
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .filter((a): a is string => typeof a === "string" && a.startsWith("/uploads/"))
        .slice(0, 10)
    : [];

  // X8/Y5: a verification request must describe what to verify OR attach
  // documents — no empty requests.
  if (note.length < 20 && attachments.length === 0) {
    return errorWithRequestContext(
      "BAD_REQUEST",
      "Опишите, что нужно подтвердить (от 20 символов), или приложите документы.",
      400,
      context,
    );
  }

  const practitioner = await db.practitioner.findUnique({
    where: { userId },
    include: { user: { select: { name: true, email: true, telegramUsername: true } } },
  });
  if (!practitioner) {
    return errorWithRequestContext("NOT_FOUND", "Practitioner profile not found", 404, context);
  }
  if (practitioner.verified) {
    return jsonWithRequestContext({ ok: true, status: "ALREADY_VERIFIED" }, undefined, context);
  }

  const existing = await db.practitionerApplication.findFirst({
    where: {
      email: practitioner.user.email,
      why: { startsWith: PRACTITIONER_VERIFICATION_PREFIX },
      status: { in: ["PENDING", "REVIEWING"] },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return jsonWithRequestContext({ ok: true, status: existing.status, applicationId: existing.id }, undefined, context);
  }

  const application = await db.practitionerApplication.create({
    data: {
      name: practitioner.user.name ?? practitioner.user.email,
      email: practitioner.user.email,
      telegram: practitioner.user.telegramUsername ? `@${practitioner.user.telegramUsername}` : null,
      specialties: practitioner.specialties,
      experience: practitioner.experience,
      formats: ["verification", "documents", "profile_review"],
      about: note || `Запрос на верификацию профиля: ${practitioner.title}`,
      why: makePractitionerVerificationMarker(practitioner.id),
      portfolio: portfolio || null,
      attachments,
      status: "PENDING",
    },
    select: { id: true, status: true },
  });

  await logAudit(userId, "PRACTITIONER_VERIFICATION_REQUEST", practitioner.id, application.id);

  return jsonWithRequestContext({ ok: true, status: application.status, applicationId: application.id }, undefined, context);
}
