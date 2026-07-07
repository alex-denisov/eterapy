export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getPractitionerAiQuota } from "@/lib/practitioner-ai-quota-db";
import { AI_TOPUP_PACKS } from "@/lib/practitioner-ai-quota";
import { formatMskDayMonth } from "@/lib/msk-time";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { AiUsageClient } from "./ai-usage-client";

// B434 — «Разборы и AI» (mockup practitioner-ai-usage): квота месяца +
// глобальный тумблер авто-разбора + per-session on/off + докупка пакетов +
// авто-докупка (default OFF). Тарифы НЕ безлимитны (owner #5).

export default async function PractitionerAiUsagePage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const userId = session.user!.id!;
  const practitioner = await db.practitioner.findUnique({
    where: { userId },
    select: { id: true, aiAutoAnalyze: true, aiAutoTopup: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const now = new Date();
  const [quota, upcoming] = await Promise.all([
    getPractitionerAiQuota(practitioner.id, userId, now),
    db.booking.findMany({
      where: {
        practitionerId: practitioner.id,
        status: { in: ["CONFIRMED", "IN_PROGRESS"] },
        slot: { endAt: { gte: now } },
      },
      orderBy: { slot: { startAt: "asc" } },
      take: 10,
      select: {
        id: true,
        aiAnalysisEnabled: true,
        client: { select: { name: true, email: true } },
        slot: { select: { startAt: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-ai-usage-page">
      <Link href={appUrl("/practitioner/more")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Ещё
      </Link>
      <p className="soft-eyebrow mt-4">Кабинет практика</p>
      <h1 className="soft-h1 mt-2">Разборы и AI</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        AI-разбор сессии (резюме, заметки, сообщение клиенту) входит в тариф пакетом на месяц. Расшифровка и
        безопасность сессий работают всегда и не тратят квоту.
      </p>

      <AiUsageClient
        quota={{
          included: quota.included,
          used: quota.usedThisMonth,
          remaining: quota.remaining,
          topupBalance: quota.topupBalance,
          resetLabel: formatMskDayMonth(quota.periodResetAt),
          tier: quota.tier,
        }}
        aiAutoAnalyze={practitioner.aiAutoAnalyze}
        aiAutoTopup={practitioner.aiAutoTopup}
        packs={AI_TOPUP_PACKS.map((p) => ({ units: p.units, priceRub: p.priceRub }))}
        upcoming={upcoming.map((b) => ({
          id: b.id,
          clientLabel: b.client.name ?? b.client.email ?? "Клиент",
          startAtIso: b.slot?.startAt.toISOString() ?? null,
          aiAnalysisEnabled: b.aiAnalysisEnabled,
        }))}
      />
    </div>
  );
}
