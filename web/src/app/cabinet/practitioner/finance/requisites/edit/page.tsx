export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import type { TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { RequisitesEditForm } from "./requisites-edit-form";

// B466 — «Реквизиты выплат» (mockup -requisites-edit): куда переводить доход.
// ИНН и налоговый статус указываются ОТДЕЛЬНО — «Налоговый статус» (owner).
// Без подтверждённого статуса сюда не попасть (редирект на tax-status).

export default async function RequisitesEditPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: {
      taxStatus: true,
      taxReviewStatus: true,
      inn: true,
      user: { select: { name: true } },
      payoutDetails: {
        select: {
          type: true,
          accountNumber: true,
          bankName: true,
          legalName: true,
          kpp: true,
          bik: true,
          corrAccount: true,
        },
      },
    },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));
  if (!practitioner.inn || practitioner.taxReviewStatus !== "VERIFIED" || practitioner.taxStatus === "UNKNOWN") {
    redirect(appUrl("/practitioner/finance/tax-status"));
  }

  const taxStatus = practitioner.taxStatus as TaxStatusKey;
  const recipientName = practitioner.user.name ?? "";

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-finance-requisites-edit */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-requisites-edit-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/finance?tab=requisites")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Реквизиты выплат</span>
          <span className="pcab-topbar-spacer" />
        </div>
        <p className="pcab-lead">
          Куда переводить ваш доход. ИНН и налоговый статус указываются отдельно — в разделе «Налоговый статус».
        </p>
        <RequisitesEditForm taxStatus={taxStatus} recipientName={recipientName} initial={practitioner.payoutDetails} variant="pcab" />
      </div>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div className="mx-auto hidden w-full max-w-2xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-requisites-edit-page">
        <Link href={appUrl("/practitioner/finance?tab=requisites")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
          <ArrowLeft className="h-4 w-4" />
          Реквизиты
        </Link>
        <p className="soft-eyebrow mt-4">Финансы практика</p>
        <h1 className="soft-h1 mt-2">Реквизиты выплат</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Куда переводить ваш доход. ИНН и налоговый статус указываются отдельно — в разделе «Налоговый статус».
        </p>

        <RequisitesEditForm taxStatus={taxStatus} recipientName={recipientName} initial={practitioner.payoutDetails} />
      </div>
    </>
  );
}
