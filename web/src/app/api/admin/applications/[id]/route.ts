/**
 * PATCH /api/admin/applications/[id]
 *
 * Updates a practitioner application's status. When the application is
 * being moved to APPROVED for the first time, this endpoint also:
 *   1. Creates a User row (role=PRACTITIONER, emailVerified=false) with a
 *      throwaway placeholder password.
 *   2. Creates a Practitioner row (status=PENDING, founding=false,
 *      verified=false) seeded from the application's specialties /
 *      experience / about — admin must finish the profile and flip
 *      status=ACTIVE before the practitioner is published.
 *   3. Generates a 1-hour resetToken and emails the applicant a password-
 *      reset link so they can set their own first password.
 *   4. Writes an audit row.
 *
 * If the email is already in use by another User (any role), returns 409
 * — admins resolve manually (e.g. by editing the existing account).
 *
 * Idempotency: a second APPROVED transition is a no-op on user creation
 * because the email already exists.
 *
 * Backlog: 11.D.2.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";
import { generateUniqueSlug } from "@/lib/slug";
import { parsePractitionerVerificationMarker } from "@/lib/practitioner-verification";
import { assignFoundingCohortIfEligible } from "@/lib/byoc";
import type { Specialty } from "@prisma/client";
import { log } from "@/lib/logger";

const VALID_STATUSES = ["PENDING", "REVIEWING", "APPROVED", "REJECTED"] as const;
type ApplicationStatus = (typeof VALID_STATUSES)[number];

const VALID_SPECIALTIES = new Set<Specialty>([
  "TAROT", "ASTROLOGY", "NUMEROLOGY", "PSYCHIC", "RUNES", "DREAMS",
]);

function deriveTitle(specialties: Specialty[]): string {
  const labels: Record<Specialty, string> = {
    TAROT: "Таролог",
    ASTROLOGY: "Астролог",
    NUMEROLOGY: "Нумеролог",
    PSYCHIC: "Экстрасенс",
    RUNES: "Рунолог",
    DREAMS: "Толкователь снов",
  };
  if (specialties.length === 0) return "Практик";
  return specialties.slice(0, 2).map((s) => labels[s]).join(" · ");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = (await req.json()) as { status?: string };
  if (!status || !VALID_STATUSES.includes(status as ApplicationStatus)) {
    return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
  }

  const application = await db.practitionerApplication.findUnique({ where: { id } });
  if (!application) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }

  const isFirstApproval = status === "APPROVED" && application.status !== "APPROVED";
  const verificationPractitionerId = parsePractitionerVerificationMarker(application.why);

  // Non-approval transition: just update status, no side effects.
  if (!isFirstApproval) {
    await db.practitionerApplication.update({ where: { id }, data: { status } });
    await logAudit(session.user!.id!, "PRACTITIONER_STATUS", id, `Заявка → ${status}`);
    return NextResponse.json({ ok: true, status, accountCreated: false });
  }

  if (verificationPractitionerId) {
    const practitioner = await db.practitioner.findUnique({
      where: { id: verificationPractitionerId },
      select: { id: true, userId: true, user: { select: { email: true } } },
    });
    if (!practitioner || practitioner.user.email.toLowerCase() !== application.email.toLowerCase()) {
      return NextResponse.json({ error: "Профиль практика для верификации не найден" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      const verifiedAt = new Date();
      await tx.practitioner.update({
        where: { id: practitioner.id },
        data: { verified: true, verifiedAt },
      });
      await assignFoundingCohortIfEligible(practitioner.id, tx, verifiedAt);
      await tx.practitionerApplication.update({
        where: { id: application.id },
        data: { status: "APPROVED" },
      });
    });
    await logAudit(
      session.user!.id!,
      "PRACTITIONER_VERIFIED",
      practitioner.userId,
      `Верификация по заявке ${application.id}`,
    );
    return NextResponse.json({ ok: true, status: "APPROVED", verificationCompleted: true, practitionerId: practitioner.id });
  }

  // First-time APPROVED: create User + Practitioner + send reset email.

  const email = application.email.toLowerCase();
  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (existingUser) {
    return NextResponse.json(
      {
        error: `Email ${email} уже занят (роль ${existingUser.role}). Обновите статус заявки вручную после ручной обработки аккаунта.`,
      },
      { status: 409 },
    );
  }

  const filteredSpecialties = (application.specialties as string[]).filter(
    (s): s is Specialty => VALID_SPECIALTIES.has(s as Specialty),
  );
  const title = deriveTitle(filteredSpecialties);
  const bio = application.about.trim();
  const experience = application.experience?.trim() || "не указан";

  const slug = await generateUniqueSlug(application.name, async (s) => {
    const exists = await db.practitioner.findUnique({ where: { slug: s }, select: { id: true } });
    return !!exists;
  });

  const tempPassword = randomBytes(24).toString("hex");
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  const resetToken = randomBytes(24).toString("hex");

  let createdUserId: string | null = null;
  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: application.name,
          password: hashedPassword,
          role: "PRACTITIONER",
          emailVerified: false,
          provider: "manual",
          telegramUsername: application.telegram?.replace(/^@/, "") || null,
          resetToken,
          resetExpires: new Date(Date.now() + 3_600_000),
        },
        select: { id: true, email: true, name: true },
      });
      const practitioner = await tx.practitioner.create({
        data: {
          userId: user.id,
          slug,
          status: "PENDING",
          title,
          bio,
          experience,
          specialties: filteredSpecialties,
          pricePerSession: 1500,
          sessionDuration: 60,
        },
        select: { id: true, slug: true },
      });
      await tx.practitionerApplication.update({
        where: { id: application.id },
        data: { status: "APPROVED" },
      });
      return { user, practitioner };
    });
    createdUserId = result.user.id;

    sendPasswordResetEmail(result.user.email, result.user.name, resetToken).catch((e) =>
      log.error("admin.applications.reset_email_failed", { err: e }),
    );

    await logAudit(
      session.user!.id!,
      "PRACTITIONER_CREATE",
      result.user.id,
      `Создан из заявки ${application.id}: ${result.user.name} (${result.user.email})`,
    );

    return NextResponse.json({
      ok: true,
      status: "APPROVED",
      accountCreated: true,
      practitioner: {
        id: result.practitioner.id,
        userId: result.user.id,
        slug: result.practitioner.slug,
        email: result.user.email,
        name: result.user.name,
      },
    });
  } catch (e) {
    log.error("admin.applications.approve_failed", { err: e });
    if (createdUserId) {
      // Best-effort rollback if the transaction committed but the helper failed downstream.
      await db.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
    const msg = e instanceof Error ? e.message : "Не удалось создать аккаунт практика";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
