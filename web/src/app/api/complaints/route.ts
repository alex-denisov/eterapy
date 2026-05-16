/**
 * POST /api/complaints — подать жалобу на сессию
 * GET  /api/complaints — список жалоб (admin only)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { Resend } from "resend";
import { logFraudEvent } from "@/lib/antifraud";
import {
  detectPractitionerTextRisk,
  holdPractitionerPayoutsForBooking,
  PRACTITIONER_HIGH_RISK_SCORE,
} from "@/lib/practitioner-antifraud";
import { log } from "@/lib/logger";

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL ?? "admin@eterapy.com";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookingId, reason, description } = await req.json();
  if (!bookingId || !reason || !description?.trim()) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }

  // Проверяем что бронирование принадлежит этому клиенту
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { name: true, email: true } },
      practitioner: { select: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });
  if (booking.clientId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Проверяем нет ли уже жалобы на это бронирование от этого пользователя
  const existing = await db.complaint.findFirst({
    where: { bookingId, reportedBy: session.user.id },
  });
  if (existing) return NextResponse.json({ error: "Жалоба на эту сессию уже подана" }, { status: 409 });

  const textRisk = detectPractitionerTextRisk(description);
  const complaint = await db.$transaction(async (tx) => {
    const created = await tx.complaint.create({
      data: {
        bookingId,
        reportedBy: session.user.id,
        reason,
        description: description.trim(),
      },
    });

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "DISPUTED",
        riskScore: { increment: Math.max(50, textRisk.riskScore) },
        riskFlags: { push: textRisk.riskFlags.length > 0 ? textRisk.riskFlags : ["client_complaint"] },
      },
    }).catch(() => null);

    await logFraudEvent(tx, {
      subjectType: "booking",
      subjectId: bookingId,
      actorUserId: session.user.id,
      action: textRisk.riskFlags.includes("external_payment_signal")
        ? "practitioner_external_payment_reported"
        : "practitioner_complaint_reported",
      status: "review",
      riskScore: Math.max(50, textRisk.riskScore),
      riskFlags: textRisk.riskFlags.length > 0 ? textRisk.riskFlags : ["client_complaint"],
      metadata: {
        complaintId: created.id,
        practitionerId: booking.practitionerId,
        reason,
      },
    });

    if (textRisk.riskScore >= PRACTITIONER_HIGH_RISK_SCORE) {
      await tx.practitioner.update({
        where: { id: booking.practitionerId },
        data: {
          riskScore: { increment: 20 },
          riskFlags: { push: textRisk.riskFlags },
        },
      });
    }

    return created;
  });

  await holdPractitionerPayoutsForBooking({
    bookingId,
    actorUserId: session.user.id,
    reason: "client_complaint",
    riskScore: Math.max(80, textRisk.riskScore),
    riskFlags: textRisk.riskFlags.length > 0 ? textRisk.riskFlags : ["client_complaint"],
  });

  await logAudit(session.user.id, "COMPLAINT_SUBMITTED", bookingId, `Причина: ${reason}`);

  // Уведомляем администратора
  if (process.env.RESEND_API_KEY) {
    const REASON_LABELS: Record<string, string> = {
      PRACTITIONER_NO_SHOW: "Практик не явился",
      ETHICAL_VIOLATION: "Нарушение этического кодекса",
      MANIPULATION: "Запугивание/манипуляции",
      TECHNICAL_ISSUE: "Технический сбой",
      EARLY_TERMINATION: "Сессия закончилась раньше",
      PAYMENT_ISSUE: "Проблема с оплатой",
      OTHER: "Другое",
    };
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    resend.emails.send({
      from: "ETerapy <noreply@eterapy.com>",
      to: ADMIN_EMAIL,
      subject: `⚠️ Новая жалоба: ${REASON_LABELS[reason] ?? reason}`,
      html: `<html><body style="font-family:Arial;background:#0D1B2A;color:#e2e8f0;padding:32px">
        <h2 style="color:#C9A84C">⚠️ ETerapy — Новая жалоба</h2>
        <p><b>Клиент:</b> ${booking.client.name} (${booking.client.email})</p>
        <p><b>Практик:</b> ${booking.practitioner.user.name}</p>
        <p><b>Причина:</b> ${REASON_LABELS[reason] ?? reason}</p>
        <p><b>Описание:</b> ${description}</p>
        <p><b>ID бронирования:</b> ${bookingId}</p>
        <br>
        <a href="${APP_URL}/admin/complaints" style="background:#C9A84C;color:#0D1B2A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Рассмотреть жалобу →
        </a>
      </body></html>`,
    }).catch((e) => log.error("complaints.admin_email_failed", { err: e }));
  }

  return NextResponse.json({ ok: true, id: complaint.id });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const complaints = await db.complaint.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      booking: {
        include: {
          client: { select: { name: true, email: true } },
          practitioner: { select: { user: { select: { name: true } } } },
        },
      },
      reporter: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ complaints });
}
