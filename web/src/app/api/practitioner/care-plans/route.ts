/**
 * B466 — «План сопровождения»: upsert плана клиента практиком.
 * POST { clientId, goals, methods, nextFocus, confirmAiSuggestion? }
 *   — сохраняет цели/методы/фокус; подтверждение AI-предложения очищает
 *     aiSuggestion (owner: AI предлагает — практик подтверждает).
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { parseCarePlanGoals, sanitizeStringList } from "@/lib/care-plan";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" ? body.clientId : null;
  if (!clientId) return NextResponse.json({ error: "clientId обязателен" }, { status: 400 });

  // План ведётся только по СВОИМ клиентам (была хотя бы одна бронь).
  const relationship = await db.booking.findFirst({
    where: { practitionerId: practitioner.id, clientId },
    select: { id: true },
  });
  if (!relationship) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  const goals = parseCarePlanGoals(body?.goals);
  const methods = sanitizeStringList(body?.methods, 12);
  const nextFocus = sanitizeStringList(body?.nextFocus, 8, 200);
  const confirmAiSuggestion = Boolean(body?.confirmAiSuggestion);

  const plan = await db.clientCarePlan.upsert({
    where: { practitionerId_clientId: { practitionerId: practitioner.id, clientId } },
    create: {
      practitionerId: practitioner.id,
      clientId,
      goals: goals as unknown as Prisma.InputJsonValue,
      methods,
      nextFocus,
    },
    update: {
      goals: goals as unknown as Prisma.InputJsonValue,
      methods,
      nextFocus,
      ...(confirmAiSuggestion ? { aiSuggestion: Prisma.DbNull, aiSuggestedAt: null } : {}),
    },
    select: { id: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, planId: plan.id, updatedAt: plan.updatedAt.toISOString() });
}
