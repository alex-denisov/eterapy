export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { SearchInput } from "./search-input";
import { BookingsManager, type AdminBookingRow } from "./bookings-manager";
import { Prisma } from "@prisma/client";

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

  const where: Prisma.BookingWhereInput = {};
  if (statusFilter) where.status = statusFilter as Prisma.BookingWhereInput["status"];
  if (search) {
    where.OR = [
      { client: { name: { contains: search, mode: "insensitive" } } },
      { practitioner: { user: { name: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const bookings = await db.booking.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      client: { select: { name: true, email: true } },
      practitioner: { include: { user: { select: { name: true } } } },
      slot: { select: { startAt: true, endAt: true } },
    },
  });

  const total = await db.booking.count({ where });

  const rows: AdminBookingRow[] = bookings.map((b) => ({
    id: b.id,
    status: b.status,
    priceRub: b.priceRub,
    durationMin: b.slot
      ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
      : 60,
    slotStartAt: b.slot ? new Date(b.slot.startAt).toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    client: { name: b.client.name, email: b.client.email },
    practitioner: { name: b.practitioner.user.name },
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Бронирования</h1>
        <span className="text-sm text-muted-foreground">Найдено: {total}</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput defaultValue={search} statusFilter={statusFilter} />
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <a
              key={s.value}
              href={`/admin/bookings?${new URLSearchParams({ status: s.value, search })}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-card/30 text-muted-foreground hover:text-foreground border border-border/30"
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <BookingsManager initial={rows} />
    </div>
  );
}
