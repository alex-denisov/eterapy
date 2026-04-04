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
    select: { id: true, pricePerSession: true },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const completedBookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });

  const totalEarned = completedBookings.reduce((sum, b) => sum + b.priceRub, 0);
  const platformFee = Math.round(totalEarned * 0.15);
  const netEarned = totalEarned - platformFee;

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-6">Выплаты</h1>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {[
          { label: "Заработано всего", value: `${totalEarned.toLocaleString("ru")} ₽`, note: "до вычета комиссии" },
          { label: "Комиссия платформы", value: `${platformFee.toLocaleString("ru")} ₽`, note: "15% от оборота" },
          { label: "К выплате", value: `${netEarned.toLocaleString("ru")} ₽`, note: "выплаты в разработке" },
        ].map((s) => (
          <Card key={s.label} className="border-border/40 bg-card/50">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary">{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 rounded-xl border border-border/30 bg-card/20 p-4 text-sm text-muted-foreground">
        💳 Система выплат через ЮKassa и Stripe подключается в ближайшее время. После подключения вы сможете привязать банковский счёт и настроить автоматические выплаты.
      </div>

      <h2 className="font-semibold mb-3">История сессий</h2>
      {completedBookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет завершённых сессий</p>
      ) : (
        <div className="space-y-2">
          {completedBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-card/10 px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{b.client.name}</p>
                <p className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString("ru-RU")}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-primary">{b.priceRub.toLocaleString("ru")} ₽</p>
                <p className="text-xs text-muted-foreground">−{Math.round(b.priceRub * 0.15)} ₽ комиссия</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
