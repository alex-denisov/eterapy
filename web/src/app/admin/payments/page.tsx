export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PaymentsPanel } from "./payments-panel";

export default async function AdminPaymentsPage() {
  const session = await auth();
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");

  // Все практики с их статистикой заработка
  const practitioners = await db.practitioner.findMany({
    where: { status: "ACTIVE" },
    include: {
      user: { select: { name: true, email: true } },
      bookings: {
        where: { status: "COMPLETED" },
        select: { id: true, priceRub: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const list = practitioners.map(p => {
    const commission = (p.commissionPercent ?? 25) / 100;
    const totalRevenue = p.bookings.reduce((s, b) => s + b.priceRub, 0);
    const platformFee = Math.round(totalRevenue * commission);
    const practitionerEarnings = totalRevenue - platformFee;
    const lastPayout = null; // TODO: PayoutRecord model
    return {
      id: p.id,
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      sessionCount: p.bookings.length,
      totalRevenue,
      commissionPercent: p.commissionPercent ?? 25,
      platformFee,
      practitionerEarnings,
      lastPayout,
    };
  });

  const totals = {
    revenue: list.reduce((s, p) => s + p.totalRevenue, 0),
    platform: list.reduce((s, p) => s + p.platformFee, 0),
    practitioners: list.reduce((s, p) => s + p.practitionerEarnings, 0),
  };

  // Blended commission = platform / revenue (fallback to 0 when no revenue).
  const blendedCommission = totals.revenue > 0
    ? Math.round((totals.platform / totals.revenue) * 100)
    : 0;

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Выплаты практикам</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Комиссия задаётся per-practitioner · средняя {blendedCommission}%
        </p>
      </div>

      {/* Итоги */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Общий оборот", value: totals.revenue, color: "text-foreground" },
          { label: `Доход платформы (${blendedCommission}% в среднем)`, value: totals.platform, color: "text-primary" },
          { label: "К выплате практикам", value: totals.practitioners, color: "text-green-400" },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-border/30 bg-card/20 px-5 py-4">
            <p className={`text-2xl font-bold tabular-nums ${item.color}`}>
              {item.value.toLocaleString("ru")} ₽
            </p>
            <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <PaymentsPanel practitioners={list} />
    </div>
  );
}
