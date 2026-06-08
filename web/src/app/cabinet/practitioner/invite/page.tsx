export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BYOC_LADDER, commissionForSource, isFoundingActive, type PractitionerCommissionTier } from "@/lib/practitioner-commission";
import { practitionerInviteLandingUrl } from "@/lib/byoc";
import { PractitionerInvitePanel } from "./invite-panel";

function tierFromCommissionSource(source: string | null | undefined): PractitionerCommissionTier {
  if (source === "subscription_pro_plus") return "practitioner_pro_plus";
  if (source === "subscription_pro") return "practitioner_pro";
  return "base";
}

export default async function PractitionerInvitePage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    select: {
      id: true,
      slug: true,
      commissionPercent: true,
      commissionSource: true,
      isFoundingCohort: true,
      foundingUntil: true,
      invites: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          token: true,
          label: true,
          freeAiHook: true,
          status: true,
          openedCount: true,
          registeredCount: true,
          bookedCount: true,
          createdAt: true,
        },
      },
    },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const tier = tierFromCommissionSource(practitioner.commissionSource);
  const foundingActive = isFoundingActive(practitioner);
  const byocRate = commissionForSource("BYOC", tier, foundingActive);
  const platformRate = practitioner.commissionPercent ?? commissionForSource("PLATFORM", tier, false);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">Свои клиенты</p>
        <h1 className="text-3xl font-semibold">Приведите своего клиента</h1>
        <p className="max-w-3xl text-muted-foreground">
          Личная ссылка закрепляет новых клиентов за вами: платите {byocRate}% вместо {platformRate}% комиссии платформенного потока.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-white/80 p-4">
          <p className="text-sm text-muted-foreground">Комиссия за своих клиентов</p>
          <p className="mt-2 text-3xl font-semibold">{byocRate}%</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-white/80 p-4">
          <p className="text-sm text-muted-foreground">Платформенная ставка</p>
          <p className="mt-2 text-3xl font-semibold">{platformRate}%</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-white/80 p-4">
          <p className="text-sm text-muted-foreground">Ставка основателя</p>
          <p className="mt-2 text-base font-medium">
            {foundingActive && practitioner.foundingUntil
              ? `12% до ${practitioner.foundingUntil.toLocaleDateString("ru-RU")}, далее ${BYOC_LADDER[tier]}%`
              : "Не активна"}
          </p>
        </div>
      </section>

      <PractitionerInvitePanel
        initialInvites={practitioner.invites.map((invite) => ({
          ...invite,
          landingUrl: practitionerInviteLandingUrl(practitioner.slug, invite.token),
          telegramUrl: `https://t.me/eterapy_bot?start=practitioner_${practitioner.slug}`,
        }))}
      />
    </div>
  );
}
