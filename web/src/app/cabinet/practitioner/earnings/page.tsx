import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export default async function PractitionerEarningsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  // @ts-expect-error custom
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    select: { id: true },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const completedBookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });

  const COMMISSION = 0.15;
  const totalRevenue = completedBookings.reduce((s, b) => s + b.priceRub, 0);
  const totalFee = Math.round(totalRevenue * COMMISSION);
  const totalNet = totalRevenue - totalFee;

  // Текущий месяц
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthBookings = completedBookings.filter(b => new Date(b.createdAt) >= startOfMonth);
  const monthRevenue = monthBookings.reduce((s, b) => s + b.priceRub, 0);
  const monthNet = monthRevenue - Math.round(monthRevenue * COMMISSION);

  // Группировка по месяцам
  const byMonth: Record<string, { revenue: number; count: number; net: number }> = {};
  for (const b of completedBookings) {
    const key = new Date(b.createdAt).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    if (!byMonth[key]) byMonth[key] = { revenue: 0, count: 0, net: 0 };
    byMonth[key].revenue += b.priceRub;
    byMonth[key].count += 1;
    byMonth[key].net += b.priceRub - Math.round(b.priceRub * COMMISSION);
  }

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-6">Выплаты и доходы</h1>

      {/* Итоги */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: "Этот месяц", value: `${monthNet.toLocaleString("ru")} ₽`, sub: `${monthBookings.length} сессий`, color: "text-primary" },
          { label: "Всего заработано", value: `${totalRevenue.toLocaleString("ru")} ₽`, sub: `${completedBookings.length} сессий`, color: "text-foreground" },
          { label: "Комиссия платформы", value: `${totalFee.toLocaleString("ru")} ₽`, sub: "15% от оборота", color: "text-muted-foreground" },
          { label: "Чистый доход", value: `${totalNet.toLocaleString("ru")} ₽`, sub: "за всё время", color: "text-green-400" },
        ].map(s => (
          <Card key={s.label} className="border-border/40 bg-card/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={`font-heading text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Баннер */}
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">💳 Подключение выплат</p>
        Система автоматических выплат на банковский счёт будет доступна после интеграции ЮKassa Payout API.
        Пока выплаты производятся вручную администратором. Напишите на{" "}
        <a href="mailto:payments@eterapy.com" className="text-primary hover:underline">payments@eterapy.com</a>.
      </div>

      {/* По месяцам */}
      {Object.keys(byMonth).length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3">По месяцам</h2>
          <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
            {Object.entries(byMonth).map(([month, data]) => (
              <div key={month} className="flex items-center gap-4 px-4 py-3">
                <span className="text-sm flex-1 capitalize">{month}</span>
                <span className="text-xs text-muted-foreground w-16 text-right">{data.count} сессий</span>
                <span className="text-sm w-24 text-right text-muted-foreground">{data.revenue.toLocaleString("ru")} ₽</span>
                <span className="text-sm w-28 text-right font-medium text-green-400">{data.net.toLocaleString("ru")} ₽ чистыми</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* История */}
      <h2 className="font-semibold mb-3">История сессий</h2>
      {completedBookings.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card/20 p-8 text-center text-sm text-muted-foreground">
          Нет завершённых сессий. Доход появится после первой оплаченной сессии.
        </div>
      ) : (
        <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
          {completedBookings.map(b => (
            <div key={b.id} className="flex items-center px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{b.client.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(b.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="text-sm font-medium text-foreground">{b.priceRub.toLocaleString("ru")} ₽</p>
                <p className="text-xs text-green-400">
                  {(b.priceRub - Math.round(b.priceRub * COMMISSION)).toLocaleString("ru")} ₽ чистыми
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
