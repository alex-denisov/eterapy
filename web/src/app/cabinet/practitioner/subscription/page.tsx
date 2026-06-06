export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { V5_SUBSCRIPTION_PLANS } from "@/lib/entitlements";
import { computePractitionerBalance } from "@/lib/practitioner-balance";
import { getSubscriptionPlanLabel, getSubscriptionStatusLabel } from "@/lib/billing-labels";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { PractitionerSubscriptionClient } from "./subscription-client";

const PRACTITIONER_PLAN_COPY: Record<string, { description: string; perks: string[] }> = {
  practitioner_pro: {
    description: "Базовый рабочий набор для сессий, расшифровок и отчётов после встреч.",
    perks: [
      "Расшифровки и конспекты сессий в кабинете практика",
      "Рабочие ссылки, widget-запись и аккуратная карточка специалиста",
      "История клиентских встреч и черновики follow-up после сессии",
    ],
  },
  practitioner_pro_plus: {
    description: "Расширенный пакет для активных практиков и командных форматов.",
    perks: [
      "Всё из Practitioner Pro",
      "Расширенные отчёты после сессий и больше автоматизации",
      "Приоритет в витрине, совместные форматы и ранний доступ к инструментам",
    ],
  },
};

export default async function PractitionerSubscriptionPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const userId = session.user!.id!;
  const [practitioner, activeSubscription] = await Promise.all([
    db.practitioner.findUnique({ where: { userId }, select: { id: true } }),
    db.userSubscription.findFirst({
      where: {
        userId,
        planKey: { in: ["practitioner_pro", "practitioner_pro_plus"] },
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: { planKey: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
  ]);

  if (!practitioner) redirect(appUrl("/practitioner"));

  const practitionerBalance = await computePractitionerBalance(practitioner.id);
  const earningsBalanceRub = Math.max(0, practitionerBalance?.currentBalance ?? 0);
  const activeLabel = getSubscriptionPlanLabel(activeSubscription?.planKey);
  const activeStatus = activeSubscription
    ? activeSubscription.cancelAtPeriodEnd
      ? "Отменяется в конце периода"
      : getSubscriptionStatusLabel(activeSubscription.status)
    : "Не подключена";

  const plans = Object.entries(V5_SUBSCRIPTION_PLANS)
    .filter(([key]) => key === "practitioner_pro" || key === "practitioner_pro_plus")
    .map(([key, plan]) => ({
      key,
      name: plan.name,
      amountKopecks: plan.amountKopecks,
      trialDays: plan.trialDays,
      description: PRACTITIONER_PLAN_COPY[key].description,
      perks: PRACTITIONER_PLAN_COPY[key].perks,
    }));

  return (
    <div className="max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="soft-eyebrow">Practitioner Pro</p>
          <h1 className="soft-h1 mt-2">Подписка практика</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Подписка практика управляется отдельно от клиентского биллинга. Её можно оплатить картой
            или доступным доходом от завершённых сессий; безопасность сессий работает для всех практиков.
          </p>
        </div>
        <Link href={appUrl("/practitioner")} className="soft-chip">
          Вернуться в сводку
        </Link>
      </div>

      <section className="soft-card mb-5 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--soft-ink-faint)]">Текущий статус</p>
            <p className="mt-1 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{activeLabel}</p>
            <p className="text-xs text-[var(--soft-ink-soft)]">{activeStatus}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--soft-ink-faint)]">Доступно из дохода</p>
            <p className="mt-1 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">
              {earningsBalanceRub.toLocaleString("ru-RU")} ₽
            </p>
            <p className="text-xs text-[var(--soft-ink-soft)]">После комиссии, hold и выплат</p>
          </div>
          <div>
            <p className="text-xs text-[var(--soft-ink-faint)]">Следующий шаг</p>
            <p className="mt-1 text-sm font-medium text-[var(--soft-ink)]">
              Выберите тариф и источник оплаты ниже.
            </p>
          </div>
        </div>
      </section>

      <PractitionerSubscriptionClient
        plans={plans}
        activePlanKey={activeSubscription?.planKey ?? null}
        earningsBalanceRub={earningsBalanceRub}
      />
    </div>
  );
}
