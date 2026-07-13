export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import { loadPractitionerAppbar } from "@/lib/practitioner-appbar";
import type { TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { FinanceTabs, type FinanceTabKey } from "./finance-tabs";
import { loadPractitionerFinance } from "./finance-data";
import { BalanceTab } from "./balance-tab";
import { TariffTab } from "./tariff-tab";
import { RequisitesTab, type RequisitesTabData } from "./requisites-tab";
import { ReportsTab } from "./reports-tab";
import { FinanceMobileShell, FinanceBalanceMobile, FinanceRequisitesMobile, FinanceReportsMobile } from "./finance-mobile";
import { FinanceTariffMobile } from "./finance-tariff-mobile";

// B466 — «Финансы»: 4-tab switcher Баланс · Тариф · Реквизиты · Отчёты
// (заменяет старые /earnings и /subscription, они редиректят сюда).
// R9-4 P4: мобильный кокпит (md:hidden, 1-в-1 по mockups practitioner-finance-*)
// + прежний десктоп (hidden md:block). Серверные загрузчики переиспользуются.

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
      title: true,
      taxStatus: true,
      taxReviewStatus: true,
      taxStatusVerifiedAt: true,
      inn: true,
      agentOfferAcceptedAt: true,
      agentOfferVersion: true,
      user: { select: { name: true, email: true } },
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
  const appbar = await loadPractitionerAppbar({
    userId,
    name: practitioner.user.name,
    email: practitioner.user.email,
    title: practitioner.title,
  });

  // Загружаем данные баланса один раз — общие для мобильного и десктопного дерева.
  const financeData = tab === "balance" ? await loadPractitionerFinance(practitioner.id) : null;
  const requisitesData: RequisitesTabData = {
    taxStatus: practitioner.taxStatus as TaxStatusKey | "UNKNOWN",
    taxReviewStatus: practitioner.taxReviewStatus,
    taxStatusVerifiedAt: practitioner.taxStatusVerifiedAt,
    inn: practitioner.inn,
    agentOfferAcceptedAt: practitioner.agentOfferAcceptedAt,
    agentOfferVersion: practitioner.agentOfferVersion,
    payoutDetails: practitioner.payoutDetails,
  };

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по макетам, десктоп скрыт */}
      <FinanceMobileShell appbar={appbar} tab={tab}>
        {tab === "balance" && financeData && <FinanceBalanceMobile data={financeData} tier={tier} />}
        {tab === "tariff" && <FinanceTariffMobile tier={tier} practitionerId={practitioner.id} userId={userId} />}
        {tab === "requisites" && <FinanceRequisitesMobile data={requisitesData} />}
        {tab === "reports" && <FinanceReportsMobile practitionerId={practitioner.id} />}
      </FinanceMobileShell>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div
        className="mx-auto hidden w-full max-w-3xl px-4 py-8 sm:px-6 md:block"
        style={{ paddingBottom: 80 }}
        data-testid="practitioner-finance-page"
      >
        <p className="soft-eyebrow">Практика</p>
        <h1 className="soft-h1 mt-2">Финансы</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Баланс, выплаты, тариф и налоговый статус. Выплаты приходят по подтверждённым реквизитам.
        </p>
        <FinanceTabs active={tab} />

        {tab === "balance" && financeData && <BalanceTab data={financeData} tier={tier} />}
        {tab === "tariff" && <TariffTab tier={tier} practitionerId={practitioner.id} userId={userId} />}
        {tab === "requisites" && <RequisitesTab data={requisitesData} />}
        {tab === "reports" && <ReportsTab practitionerId={practitioner.id} />}
      </div>
    </>
  );
}
