export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BYOC_LADDER, PLATFORM_COMMISSION_BY_TIER } from "@/lib/practitioner-commission";
import { practitionerInviteLandingUrl } from "@/lib/byoc";
import { appUrl } from "@/lib/subdomain";
import { PractitionerInvitePanel } from "./invite-panel";

export default async function PractitionerInvitePage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    select: {
      id: true,
      slug: true,
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

  const invitesForPanel = practitioner.invites.map((invite) => ({
    ...invite,
    landingUrl: practitionerInviteLandingUrl(practitioner.slug, invite.token),
    telegramUrl: `https://t.me/eterapy_bot?start=practitioner_${practitioner.slug}`,
  }));

  // Геро-ставки Pro/Pro+ (мобильный геро) из матрицы комиссий (code == matrix).
  const heroRates = {
    proByoc: BYOC_LADDER.practitioner_pro,
    proPlatform: PLATFORM_COMMISSION_BY_TIER.practitioner_pro,
    proPlusByoc: BYOC_LADDER.practitioner_pro_plus,
    proPlusPlatform: PLATFORM_COMMISSION_BY_TIER.practitioner_pro_plus,
  };

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-more-invite */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-invite-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/more")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Приглашения</span>
          <span className="pcab-topbar-spacer" />
        </div>
        <PractitionerInvitePanel initialInvites={invitesForPanel} variant="pcab" heroRates={heroRates} />
      </div>

      {/* ДЕСКТОП R9-5 — 1-в-1 practitioner-desktop-invite-v2 (именованные ссылки,
          Открытия/Регистрации/Записи, крючок = бесплатный короткий разбор; без баллов/₽). */}
      <div className="mx-auto hidden w-full max-w-6xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-invite-page">
        <p className="soft-eyebrow">Практика</p>
        <h1 className="soft-h1 mt-2">Приглашения</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Приводите своих клиентов по личной ссылке — она ведёт на вашу карточку и запись. Переходы, регистрации и записи считаются автоматически.
        </p>
        <div className="mt-6">
          <PractitionerInvitePanel initialInvites={invitesForPanel} />
        </div>
      </div>
    </>
  );
}
