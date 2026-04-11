import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { getBookingStatus } from "@/lib/booking-status";

export default async function AdminBookingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const bookings = await db.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      client: { select: { name: true, email: true } },
      practitioner: { include: { user: { select: { name: true } } } },
      slot: true,
    },
  });

  const total = await db.booking.count();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Бронирования</h1>
        <span className="text-sm text-muted-foreground">Всего: {total}</span>
      </div>

      <div className="space-y-2">
        {bookings.map((b) => {
          const st = getBookingStatus(b.status);
          return (
            <div key={b.id} className="flex items-center justify-between rounded-xl border border-border/20 bg-card/20 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {b.client.name} → {b.practitioner.user.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.priceRub.toLocaleString("ru")} ₽ ·{" "}
                  {b.slot ? new Date(b.slot.startAt).toLocaleDateString("ru-RU") : "Слот не выбран"} ·{" "}
                  {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <Badge className={st.color}>{st.label}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
