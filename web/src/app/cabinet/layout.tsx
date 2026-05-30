import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CabinetShell } from "@/components/cabinet/cabinet-shell";
import { loginUrl, logoutUrl, mainUrl } from "@/lib/subdomain";
import { noIndexRobots } from "@/lib/seo";
import { getSessionAccountAccessState, inactiveAccountReason } from "@/lib/account-state";
import { getSubscriptionPlan } from "@/lib/entitlements";

const RU_MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function subscriptionLabel(planKey: string, periodEnd: Date | null): string {
  const plan = getSubscriptionPlan(planKey);
  const name = plan?.name ?? planKey;
  if (!periodEnd) return name;
  const d = periodEnd.getDate();
  const m = RU_MONTHS_SHORT[periodEnd.getMonth()];
  return `${name} · до ${d} ${m}`;
}

export const metadata: Metadata = {
  robots: noIndexRobots,
};

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  const accountState = await getSessionAccountAccessState(session);
  const inactiveReason = inactiveAccountReason(accountState);
  if (inactiveReason) redirect(`${logoutUrl()}?reason=${inactiveReason}`);
  const role = session.user?.role ?? "CLIENT";

  const activeSub = await db.userSubscription.findFirst({
    where: {
      userId: session.user.id,
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
    },
    select: { planKey: true, currentPeriodEnd: true },
    orderBy: { createdAt: "desc" },
  });
  const subLabel = activeSub ? subscriptionLabel(activeSub.planKey, activeSub.currentPeriodEnd) : "Бесплатный";

  // B1: impersonation is now carried by a separate cookie and surfaced via
  // session.user.impersonatedBy (resolved in the auth() wrapper). Keep the
  // legacy cookie checks as a fallback for in-flight old sessions.
  const cookieStore = await cookies();
  const isImpersonating =
    Boolean(session.user?.impersonatedBy) ||
    cookieStore.has("eterapy-imp") ||
    cookieStore.has("admin-impersonating") ||
    cookieStore.has("admin-session-backup");

  return (
    <>
      {isImpersonating && (
        <div className="sticky top-0 z-[100] bg-amber-500 text-black text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-3">
          <span>👁️ Режим имперсонации — вы видите кабинет от имени другого пользователя</span>
          <a
            href={mainUrl("/api/admin/stop-impersonate")}
            className="underline font-bold hover:no-underline"
          >
            ← Вернуться
          </a>
        </div>
      )}
      <CabinetShell role={role} user={session.user} subscriptionLabel={subLabel}>{children}</CabinetShell>
    </>
  );
}
