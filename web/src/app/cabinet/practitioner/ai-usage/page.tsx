export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getPractitionerAiQuota } from "@/lib/practitioner-ai-quota-db";
import { AI_TOPUP_PACKS } from "@/lib/practitioner-ai-quota";
import { formatMskDayMonth } from "@/lib/msk-time";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { AiUsageClient } from "./ai-usage-client";
import { AiUsageMobile } from "./ai-usage-mobile";

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

  const quotaProps = {
    included: quota.included,
    used: quota.usedThisMonth,
    remaining: quota.remaining,
    topupBalance: quota.topupBalance,
    resetLabel: formatMskDayMonth(quota.periodResetAt),
    tier: quota.tier,
  };
  const packsProps = AI_TOPUP_PACKS.map((p) => ({ units: p.units, priceRub: p.priceRub }));
  const upcomingProps = upcoming.map((b) => ({
    id: b.id,
    clientLabel: b.client.name ?? b.client.email ?? "Клиент",
    startAtIso: b.slot?.startAt.toISOString() ?? null,
    aiAnalysisEnabled: b.aiAnalysisEnabled,
  }));

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 mockup practitioner-ai-usage (pcab-native) */}
      <AiUsageMobile
        quota={quotaProps}
        aiAutoAnalyze={practitioner.aiAutoAnalyze}
        aiAutoTopup={practitioner.aiAutoTopup}
        packs={packsProps}
        upcoming={upcomingProps}
        backHref={appUrl("/practitioner/more")}
      />

      {/* ДЕСКТОП R9-5 — 1-в-1 practitioner-desktop-ai-usage-v2 (метр + тумблеры
          слева, докупка + авто-докупка + тариф-нота справа; low-quota баннер). */}
      <div className="mx-auto hidden w-full max-w-6xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-ai-usage-page">
        <p className="soft-eyebrow">Практика</p>
        <h1 className="soft-h1 mt-2">Разборы и AI</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          AI-помощник готовит резюме сессий, черновики сообщений и подготовку к встрече. Каждый разбор расходует лимит месяца.
        </p>

        <AiUsageClient
          quota={quotaProps}
          aiAutoAnalyze={practitioner.aiAutoAnalyze}
          aiAutoTopup={practitioner.aiAutoTopup}
          packs={packsProps}
          upcoming={upcomingProps}
        />
      </div>
    </>
  );
}
