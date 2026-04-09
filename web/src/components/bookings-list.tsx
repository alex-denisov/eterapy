"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { getBookingStatus } from "@/lib/booking-status";

interface Booking {
  id: string;
  status: string;
  priceRub: number;
  createdAt: string;
  slot: { startAt: string; endAt: string } | null;
  practitioner?: { name: string };
  client?: { name: string; email: string };
}

export function BookingsList({ role = "client" }: { role?: "client" | "practitioner" }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/bookings?role=${role}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); }
        else { setBookings(d.bookings || []); }
        setLoaded(true);
      })
      .catch(() => { setError("Не удалось загрузить записи"); setLoaded(true); });
  }, [role]);

  async function cancelBooking(bookingId: string) {
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status: "CANCELLED" }),
      });
      const data = await res.json();
      if (data.booking) {
        setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: "CANCELLED" } : b));
        toast.success("Бронирование отменено");
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
  }

  async function confirmBooking(bookingId: string) {
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status: "CONFIRMED" }),
      });
      const data = await res.json();
      if (data.booking) {
        setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: "CONFIRMED" } : b));
        toast.success("Бронирование подтверждено");
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
  }

  // Трёхсостояние: loading → error | empty | data
  if (!loaded) return <p className="text-sm text-muted-foreground animate-pulse">Загружаем записи...</p>;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 py-12 text-center">
        <p className="text-destructive text-sm">⚠️ {error}</p>
        <button
          onClick={() => { setLoaded(false); setError(null); }}
          className="mt-3 text-sm text-primary hover:underline"
        >
          Попробовать снова →
        </button>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 py-12 text-center text-muted-foreground">
        {role === "client" ? (
          <>
            <p>Нет записей к практикам.</p>
            <Link href="/cabinet/practitioners" className="mt-2 block text-sm text-primary hover:underline">
              Найти практика →
            </Link>
          </>
        ) : (
          <p>Нет запросов на сессии.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((b) => {
        const st = getBookingStatus(b.status);
        const slotStr = b.slot
          ? new Date(b.slot.startAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          : "Слот уточняется";
        const counterpart = role === "client" ? b.practitioner?.name : b.client?.name;

        return (
          <div key={b.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-card/30 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">{counterpart}</p>
                <Badge variant="secondary" className={`text-xs ${st.color}`}>{st.label}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{slotStr} · {b.priceRub.toLocaleString("ru")} ₽</p>
            </div>
            <div className="ml-4 flex shrink-0 gap-2">
              {role === "practitioner" && b.status === "PENDING" && (
                <button
                  onClick={() => confirmBooking(b.id)}
                  className="rounded-lg border border-green-500/30 px-3 py-1 text-xs text-green-400 hover:bg-green-500/10 transition-colors"
                >
                  Подтвердить
                </button>
              )}
              {b.status === "PENDING" && (
                <button
                  onClick={() => cancelBooking(b.id)}
                  className="rounded-lg border border-border/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Отменить
                </button>
              )}
              {b.status === "CONFIRMED" && (
                <button className="rounded-lg border border-primary/30 px-3 py-1 text-xs text-primary hover:bg-primary/10 transition-colors">
                  Войти в сессию
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
