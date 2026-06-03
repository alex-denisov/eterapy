import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CabinetShell } from "@/components/cabinet/cabinet-shell";
import { loginUrl, logoutUrl } from "@/lib/subdomain";
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

  // X10: practitioner sidebar «непрочитанные» counters — new requests, upcoming
  // confirmed bookings, and recent reviews.
  let counts: Record<string, number> | undefined;
  if (role === "PRACTITIONER") {
    const practitioner = await db.practitioner
      .findUnique({ where: { userId: session.user.id }, select: { id: true } })
      .catch(() => null);
    if (practitioner) {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const [requests, clients, reviews] = await Promise.all([
        // Заявки — booking requests awaiting the practitioner's confirmation.
        db.booking.count({ where: { practitionerId: practitioner.id, status: "PENDING" } }).catch(() => 0),
        // Клиенты — confirmed upcoming sessions to attend.
        db.booking.count({ where: { practitionerId: practitioner.id, status: "CONFIRMED" } }).catch(() => 0),
        // Отзывы — reviews received in the last 14 days.
        db.review.count({ where: { practitionerId: practitioner.id, createdAt: { gte: since } } }).catch(() => 0),
      ]);
      counts = { requests, clients, reviews };
    }
  }

  // W5: impersonation is surfaced ONLY via session.user.impersonatedBy, which
  // the auth() wrapper sets only when the REAL session is an admin/superadmin
  // actively impersonating. Relying on raw cookie presence was wrong — a stale
  // eterapy-imp cookie left after logout made the banner appear for a freshly
  // logged-in practitioner who was never being impersonated.
  // X2: the impersonation banner is now rendered globally in the root layout
  // (above the header), so the cabinet layout no longer renders its own.
  return (
    <CabinetShell role={role} user={session.user} subscriptionLabel={subLabel} counts={counts}>{children}</CabinetShell>
  );
}
