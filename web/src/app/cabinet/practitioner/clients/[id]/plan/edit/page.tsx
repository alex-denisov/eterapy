export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { parseCarePlanGoals, sanitizeStringList } from "@/lib/care-plan";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { PlanEditForm } from "./plan-edit-form";

// B466 — «Редактирование плана сопровождения» (mockup -client-plan-edit):
// AI-баннер с предложением после сессии + цели со слайдерами прогресса +
// методы + фокус; сохранение подтверждает изменения (owner: AI предлагает —
// практик подтверждает).

export default async function PlanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const { id: clientId } = await params;
  const relationship = await db.booking.findFirst({
    where: { practitionerId: practitioner.id, clientId },
    select: { id: true },
  });
  if (!relationship) notFound();

  const [client, plan] = await Promise.all([
    db.user.findUnique({ where: { id: clientId }, select: { name: true, email: true } }),
    db.clientCarePlan.findUnique({
      where: { practitionerId_clientId: { practitionerId: practitioner.id, clientId } },
      select: { goals: true, methods: true, nextFocus: true, aiSuggestion: true },
    }),
  ]);
  if (!client) notFound();

  const suggestionRaw = plan?.aiSuggestion as Record<string, unknown> | null | undefined;
  const suggestion = suggestionRaw
    ? {
        goals: parseCarePlanGoals(suggestionRaw.goals),
        methods: sanitizeStringList(suggestionRaw.methods, 12),
        nextFocus: sanitizeStringList(suggestionRaw.nextFocus, 8, 200),
        note: typeof suggestionRaw.note === "string" ? suggestionRaw.note.slice(0, 400) : null,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-plan-edit-page">
      <Link href={appUrl(`/practitioner/clients/${clientId}?tab=plan`)} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        План
      </Link>
      <p className="soft-eyebrow mt-4">{client.name ?? client.email ?? "Клиент"}</p>
      <h1 className="soft-h1 mt-2">План сопровождения</h1>

      <PlanEditForm
        clientId={clientId}
        initialGoals={parseCarePlanGoals(plan?.goals)}
        initialMethods={plan?.methods ?? []}
        initialNextFocus={plan?.nextFocus ?? []}
        suggestion={suggestion}
      />
    </div>
  );
}
