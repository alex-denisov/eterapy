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
import { MovementsTab, normalizeMovementsFilter } from "./movements-tab";
import { ReceiptsTab } from "./receipts-tab";
import { FinanceMobileShell, FinanceBalanceMobile, FinanceRequisitesMobile, FinanceReportsMobile } from "./finance-mobile";
import { FinanceTariffMobile } from "./finance-tariff-mobile";

// B466 — «Финансы».
// Мобайл (R9-4): 4-tab switcher Баланс · Тариф · Реквизиты · Отчёты (Движение/
// Чеки — drill-down роуты) — md:hidden, 1-в-1 по mockups practitioner-finance-*.
// Десктоп (R9-5 -finance-v2, owner ROUND 4 #3): 6 вкладок Баланс · Тариф ·
// Реквизиты · Движение · Отчёты · Чеки (hidden md:block). Серверные загрузчики
// переиспользуются. Старые /earnings и /subscription редиректят сюда.

const TAB_KEYS = new Set<FinanceTabKey>(["balance", "tariff", "requisites", "movements", "reports", "receipts"]);
const MOBILE_TAB_KEYS = new Set<FinanceTabKey>(["balance", "tariff", "requisites", "reports"]);

export default async function PractitionerFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string }>;
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
          // B583: адресат сплита Robokassa.
          robokassaAccount: true,
        },
      },
    },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const { tab: rawTab, filter: rawFilter } = await searchParams;
  const tab: FinanceTabKey = TAB_KEYS.has(rawTab as FinanceTabKey) ? (rawTab as FinanceTabKey) : "balance";
  const mobileTab: FinanceTabKey = MOBILE_TAB_KEYS.has(tab) ? tab : "balance";
  const movementsFilter = normalizeMovementsFilter(rawFilter);
  const planKey = await getActivePractitionerPlanKey(userId);
  const tier = practitionerTierFromPlanKey(planKey);
  const appbar = await loadPractitionerAppbar({
    userId,
    name: practitioner.user.name,
    email: practitioner.user.email,
    title: practitioner.title,
  });

  // financeData нужен десктоп-Балансу, десктоп-Отчётам (byMonth) и мобильному Балансу.
  const financeData = tab === "balance" || tab === "reports" ? await loadPractitionerFinance(practitioner.id) : null;
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
      {/* МОБАЙЛ — 1-в-1 по макетам (4 вкладки), десктоп скрыт. Движение/Чеки —
          drill-down роуты; ?tab=movements|receipts — десктоп-only, на мобиле
          сегмент падает на «Баланс». */}
      <FinanceMobileShell appbar={appbar} tab={mobileTab}>
        {mobileTab === "balance" && financeData && <FinanceBalanceMobile data={financeData} tier={tier} />}
        {mobileTab === "tariff" && <FinanceTariffMobile tier={tier} practitionerId={practitioner.id} userId={userId} />}
        {mobileTab === "requisites" && <FinanceRequisitesMobile data={requisitesData} />}
        {mobileTab === "reports" && <FinanceReportsMobile practitionerId={practitioner.id} />}
      </FinanceMobileShell>

      {/* ДЕСКТОП — 6 вкладок по -finance-v2 */}
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
        {tab === "movements" && <MovementsTab practitionerId={practitioner.id} filter={movementsFilter} />}
        {tab === "reports" && financeData && <ReportsTab practitionerId={practitioner.id} byMonth={financeData.byMonth} />}
        {tab === "receipts" && <ReceiptsTab practitionerId={practitioner.id} taxStatus={practitioner.taxStatus} />}
      </div>
    </>
  );
}
