export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { getBookingStatus } from "@/lib/booking-status";
import { Input } from "@/components/ui/input";

const STATUSES = [
  { value: "", label: "Все" },
  { value: "PENDING", label: "Ожидает" },
  { value: "CONFIRMED", label: "Подтверждено" },
  { value: "IN_PROGRESS", label: "В процессе" },
  { value: "COMPLETED", label: "Завершено" },
  { value: "CANCELLED", label: "Отменено" },
  { value: "DISPUTED", label: "Оспорено" },
  { value: "REFUNDED", label: "Возврат" },
];

export default async function AdminBookingsPage(props: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const sp = await props.searchParams;
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const statusFilter = sp.status ?? "";
  const search = sp.search ?? "";

  const where: any = {};
  if (statusFilter) where.status = statusFilter;
  if (search) {
    where.OR = [
      { client: { name: { contains: search, mode: "insensitive" as const } } },
      { practitioner: { user: { name: { contains: search, mode: "insensitive" as const } } } },
    ];
  }

  const bookings = await db.booking.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      client: { select: { name: true, email: true } },
      practitioner: { include: { user: { select: { name: true } } } },
      slot: true,
    },
  });

  const total = await db.booking.count(where);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Бронирования</h1>
        <span className="text-sm text-muted-foreground">Найдено: {total}</span>
      </div>

      {/* Фильтры */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input placeholder="Поиск по имени..."
          defaultValue={search}
          className="bg-card/50 max-w-xs h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value;
              window.location.href = `/admin/bookings?${new URLSearchParams({ status: statusFilter, search: val })}`;
            }
          }}
        />
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map(s => (
            <a key={s.value}
              href={`/admin/bookings?${new URLSearchParams({ status: s.value, search })}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-card/30 text-muted-foreground hover:text-foreground border border-border/30"
              }`}>
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {bookings.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Нет бронирований</p>
        ) : bookings.map((b) => {
          const st = getBookingStatus(b.status);
          return (
            <div key={b.id} className="flex items-center justify-between rounded-xl border border-border/20 bg-card/20 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {b.client.name} → {b.practitioner.user.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.priceRub.toLocaleString("ru-RU")} ₽ ·{" "}
                  {b.slot ? new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Слот не выбран"} ·{" "}
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
