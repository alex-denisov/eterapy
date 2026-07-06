export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import type { TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { FinanceTabs, type FinanceTabKey } from "./finance-tabs";
import { loadPractitionerFinance } from "./finance-data";
import { BalanceTab } from "./balance-tab";
import { TariffTab } from "./tariff-tab";
import { RequisitesTab } from "./requisites-tab";
import { ReportsTab } from "./reports-tab";

// B466 — «Финансы»: 4-tab switcher Баланс · Тариф · Реквизиты · Отчёты
// (заменяет старые /earnings и /subscription, они редиректят сюда).

const TAB_KEYS = new Set<FinanceTabKey>(["balance", "tariff", "requisites", "reports"]);

export default async function PractitionerFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const userId = session.user!.id!;
  const practitioner = await db.practitioner.findUnique({
    where: { userId },
    select: {
      id: true,
      taxStatus: true,
      taxReviewStatus: true,
      taxStatusVerifiedAt: true,
      inn: true,
      agentOfferAcceptedAt: true,
      agentOfferVersion: true,
      payoutDetails: {
        select: {
          type: true,
          accountNumber: true,
          bankName: true,
          legalName: true,
          kycStatus: true,
        },
      },
    },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const { tab: rawTab } = await searchParams;
  const tab: FinanceTabKey = TAB_KEYS.has(rawTab as FinanceTabKey) ? (rawTab as FinanceTabKey) : "balance";
  const planKey = await getActivePractitionerPlanKey(userId);
  const tier = practitionerTierFromPlanKey(planKey);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-finance-page">
      <p className="soft-eyebrow">Финансы практика</p>
      <h1 className="soft-h1 mt-2">Финансы</h1>
      <FinanceTabs active={tab} />

      {tab === "balance" && <BalanceTab data={await loadPractitionerFinance(practitioner.id)} tier={tier} />}
      {tab === "tariff" && <TariffTab tier={tier} practitionerId={practitioner.id} userId={userId} />}
      {tab === "requisites" && (
        <RequisitesTab
          data={{
            taxStatus: practitioner.taxStatus as TaxStatusKey | "UNKNOWN",
            taxReviewStatus: practitioner.taxReviewStatus,
            taxStatusVerifiedAt: practitioner.taxStatusVerifiedAt,
            inn: practitioner.inn,
            agentOfferAcceptedAt: practitioner.agentOfferAcceptedAt,
            agentOfferVersion: practitioner.agentOfferVersion,
            payoutDetails: practitioner.payoutDetails,
          }}
        />
      )}
      {tab === "reports" && <ReportsTab practitionerId={practitioner.id} />}
    </div>
  );
}
