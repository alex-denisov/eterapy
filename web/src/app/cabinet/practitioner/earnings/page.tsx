export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, Wallet, CalendarClock } from "lucide-react";
import { PAYOUT_TZ, formatPayoutDate, nextPayoutDate } from "@/lib/payout-schedule";

interface Movement {
  id: string;
  kind: "earning" | "payout";
  date: Date;
  amountRub: number;
  label: string;
  sublabel: string;
}

export default async function PractitionerEarningsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    select: { id: true, commissionPercent: true },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const commissionPercent = practitioner.commissionPercent ?? 25;
  const commission = commissionPercent / 100;

  const [completedBookings, payouts] = await Promise.all([
    db.booking.findMany({
      where: { practitionerId: practitioner.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
    db.payout.findMany({
      where: { practitionerId: practitioner.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const netOf = (rub: number) => rub - Math.round(rub * commission);

  const totalRevenue = completedBookings.reduce((s, b) => s + b.priceRub, 0);
  const totalFee = Math.round(totalRevenue * commission);
  const accruedNet = totalRevenue - totalFee;

  const paidOutKopecks = payouts
    .filter((p) => p.status === "DONE")
    .reduce((s, p) => s + p.amountKopecks, 0);
  const paidOut = Math.round(paidOutKopecks / 100);

  const pendingPayoutKopecks = payouts
    .filter((p) => p.status === "PENDING" || p.status === "PROCESSING")
    .reduce((s, p) => s + p.amountKopecks, 0);
  const pendingPayout = Math.round(pendingPayoutKopecks / 100);

  const currentBalance = accruedNet - paidOut - pendingPayout;

  const now = new Date();
  const nextPayoutOn = nextPayoutDate(now);

  // Текущий месяц
  const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: PAYOUT_TZ,
  });
  const monthKey = monthFormatter.format(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthBookings = completedBookings.filter((b) => new Date(b.createdAt) >= startOfMonth);
  const monthRevenue = monthBookings.reduce((s, b) => s + b.priceRub, 0);
  const monthNet = monthRevenue - Math.round(monthRevenue * commission);

  // Группировка по месяцам
  const byMonth: Record<string, { revenue: number; count: number; net: number }> = {};
  for (const b of completedBookings) {
    const key = monthFormatter.format(new Date(b.createdAt));
    if (!byMonth[key]) byMonth[key] = { revenue: 0, count: 0, net: 0 };
    byMonth[key].revenue += b.priceRub;
    byMonth[key].count += 1;
    byMonth[key].net += netOf(b.priceRub);
  }

  // Движение средств: зачисления (сессии) + списания (выплаты)
  const movements: Movement[] = [
    ...completedBookings.map<Movement>((b) => ({
      id: `b-${b.id}`,
      kind: "earning",
      date: new Date(b.createdAt),
      amountRub: netOf(b.priceRub),
      label: `Сессия · ${b.client.name}`,
      sublabel: `${b.priceRub.toLocaleString("ru")} ₽ − ${commissionPercent}% комиссия`,
    })),
    ...payouts.map<Movement>((p) => {
      const labels: Record<string, string> = {
        PENDING: "Ожидает выплаты",
        HELD: "Удержана (рассмотрение жалобы)",
        PROCESSING: "В процессе",
        DONE: "Выплата",
        FAILED: "Удержана (по решению модератора)",
      };
      const netRub = Math.round(p.amountKopecks / 100);
      // Восстанавливаем gross (priceRub до вычета комиссии): net = price * (1 - c/100) ⇒ price = net / (1 - c/100)
      const grossRub = commission < 1 ? Math.round(netRub / (1 - commission)) : netRub;
      const feeRub = grossRub - netRub;
      return {
        id: `p-${p.id}`,
        kind: "payout",
        date: p.processedAt ?? p.createdAt,
        amountRub: netRub,
        label: labels[p.status] ?? "Выплата",
        sublabel: `Сессия · ${grossRub.toLocaleString("ru")} ₽ − комиссия ${feeRub.toLocaleString("ru")} ₽ (${commissionPercent}%)`,
      };
    }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="max-w-5xl px-4 py-8 sm:px-6">
      <p className="premium-eyebrow">Финансы практика</p>
      <h1 className="premium-title mt-2 mb-1 text-3xl md:text-5xl">Выплаты и доходы</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Баланс, движение средств и предстоящие выплаты. Комиссия платформы · {commissionPercent}%
      </p>

      {/* Баланс + следующая выплата */}
      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <Card className="soft-card">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Текущий баланс</p>
                <p className="font-heading text-2xl font-bold text-primary tabular-nums">
                  {currentBalance.toLocaleString("ru")} ₽
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  К выплате на следующую дату
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="soft-card">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/15 text-green-400">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Следующая выплата</p>
                <p className="font-heading text-2xl font-bold text-foreground">
                  {formatPayoutDate(nextPayoutOn)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Запланировано · {currentBalance.toLocaleString("ru")} ₽
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Итоги */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: monthKey, value: `${monthNet.toLocaleString("ru")} ₽`, sub: `${monthBookings.length} сессий`, color: "text-foreground" },
          { label: "Всего заработано", value: `${accruedNet.toLocaleString("ru")} ₽`, sub: `${completedBookings.length} сессий`, color: "text-foreground" },
          { label: "Уже выплачено", value: `${paidOut.toLocaleString("ru")} ₽`, sub: `${payouts.filter((p) => p.status === "DONE").length} выплат`, color: "text-muted-foreground" },
          { label: "Комиссия платформы", value: `${totalFee.toLocaleString("ru")} ₽`, sub: `${commissionPercent}% от оборота`, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="soft-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 capitalize">{s.label}</p>
              <p className={`font-heading text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Баннер о графике выплат */}
      <div className="soft-card mb-6 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">График выплат</p>
        Выплаты начисляются дважды в месяц — <span className="text-foreground">1-го и 15-го числа</span>{" "}
        по московскому времени. На дату выплаты переводится весь доступный баланс за минусом комиссии платформы.
        Реквизиты можно настроить в разделе «Настройки».
      </div>

      {/* Движение средств */}
      <div className="mb-6">
        <h2 className="font-semibold mb-3">Движение средств</h2>
        {movements.length === 0 ? (
          <div className="soft-card p-8 text-center text-sm text-muted-foreground">
            Нет движений. Доход появится после первой завершённой сессии.
          </div>
        ) : (
          <div className="soft-card overflow-hidden divide-y divide-border/10">
            {movements.map((m) => {
              const isEarning = m.kind === "earning";
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      isEarning ? "bg-green-500/10 text-green-400" : "bg-orange-500/10 text-orange-400"
                    }`}
                  >
                    {isEarning ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatPayoutDate(m.date)} · {m.sublabel}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-medium tabular-nums whitespace-nowrap ${
                      isEarning ? "text-green-400" : "text-orange-400"
                    }`}
                  >
                    {isEarning ? "+" : "−"}
                    {m.amountRub.toLocaleString("ru")} ₽
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* По месяцам */}
      {Object.keys(byMonth).length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3">По месяцам</h2>
          <div className="soft-card overflow-hidden divide-y divide-border/10">
            {Object.entries(byMonth).map(([month, data]) => (
              <div key={month} className="flex items-center gap-4 px-4 py-3">
                <span className="text-sm flex-1 capitalize">{month}</span>
                <span className="text-xs text-muted-foreground w-16 text-right">{data.count} сессий</span>
                <span className="text-sm w-24 text-right text-muted-foreground">
                  {data.revenue.toLocaleString("ru")} ₽
                </span>
                <span className="text-sm w-28 text-right font-medium text-green-400">
                  {data.net.toLocaleString("ru")} ₽ чистыми
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
