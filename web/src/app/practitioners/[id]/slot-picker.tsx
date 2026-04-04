"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";

interface Slot {
  id: string;
  startAt: string;
  endAt: string;
}

// Group slots by date string "YYYY-MM-DD"
function groupByDate(slots: Slot[]): Record<string, Slot[]> {
  return slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const key = s.startAt.slice(0, 10); // "2026-04-05"
    (acc[key] ??= []).push(s);
    return acc;
  }, {});
}

function formatWeekday(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("ru-RU", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function SlotPicker({
  practitionerId,
  practitionerName,
  pricePerSession,
  sessionDuration = 60,
}: {
  practitionerId: string;
  practitionerName: string;
  pricePerSession: number;
  sessionDuration?: number;
}) {
  const { data: session, status } = useSession();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  useEffect(() => {
    fetch(`/api/slots?practitionerId=${practitionerId}`)
      .then((r) => r.json())
      .then((d) => { setSlots(d.slots ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [practitionerId]);

  const byDate = useMemo(() => groupByDate(slots), [slots]);
  const dates = useMemo(() => Object.keys(byDate).sort(), [byDate]);
  const slotsForDate = selectedDate ? (byDate[selectedDate] ?? []) : [];

  async function doBook() {
    if (!selectedSlot) { toast.error("Выберите время сессии"); return; }
    setBooking(true);
    setShowAuth(false);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practitionerId, slotId: selectedSlot.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setBooked(true);
        toast.success("Запись оформлена!", { description: "Письма отправлены вам и практику." });
      } else {
        toast.error(data.error ?? "Не удалось забронировать");
        if (data.error?.includes("занят")) {
          fetch(`/api/slots?practitionerId=${practitionerId}`)
            .then(r => r.json())
            .then(d => { setSlots(d.slots ?? []); setSelectedSlot(null); });
        }
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setBooking(false); }
  }

  function handleBook() {
    if (status === "loading") return;
    if (!selectedSlot) { toast.error("Выберите удобное время"); return; }
    if (!session) {
      setAuthMode("login");
      setShowAuth(true);
      return;
    }
    doBook();
  }

  const durLabel = sessionDuration === 30 ? "30 мин"
    : sessionDuration === 45 ? "45 мин"
    : sessionDuration === 90 ? "1.5 часа"
    : sessionDuration === 120 ? "2 часа"
    : "1 час";

  if (booked) {
    return (
      <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="font-heading text-lg font-semibold text-green-400">Запись оформлена!</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Письма отправлены вам и практику. Следите за статусом в{" "}
          <a href="/cabinet/bookings" className="text-primary hover:underline">кабинете</a>.
        </p>
      </div>
    );
  }

  return (
    <>
      {showAuth && (
        <AuthModal
          toolName="записи к практику"
          initialMode={authMode}
          onSuccess={doBook}
          onClose={() => setShowAuth(false)}
        />
      )}

      <div className="mt-4 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse">Загружаем расписание...</p>
        ) : slots.length === 0 ? (
          <div className="rounded-lg border border-border/30 bg-card/20 px-4 py-3">
            <p className="text-sm text-muted-foreground">Практик пока не добавил открытые слоты.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Вернитесь позже или напишите напрямую.</p>
          </div>
        ) : (
          <>
            {/* Шаг 1 — выбор даты */}
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Выберите дату:</p>
              <div className="flex flex-wrap gap-2">
                {dates.map((d) => (
                  <button key={d} onClick={() => { setSelectedDate(d); setSelectedSlot(null); }}
                    className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                      selectedDate === d
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/40 text-muted-foreground hover:border-primary/40"
                    }`}>
                    <p className="font-medium">{formatWeekday(d)}</p>
                    <p className="text-[11px] mt-0.5 text-muted-foreground">
                      {byDate[d].length} {byDate[d].length === 1 ? "слот" : "слота"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Шаг 2 — выбор времени */}
            {selectedDate && (
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Выберите время:</p>
                <div className="flex flex-wrap gap-2">
                  {slotsForDate.map((slot) => {
                    const isSelected = selectedSlot?.id === slot.id;
                    return (
                      <button key={slot.id} onClick={() => setSelectedSlot(isSelected ? null : slot)}
                        className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary font-medium shadow-[0_0_8px_rgba(201,168,76,0.2)]"
                            : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}>
                        {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                        <span className="ml-1.5 text-[11px] text-muted-foreground/60">· {durLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Итого */}
        {selectedSlot && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Выбрано</p>
              <p className="text-sm font-medium">
                {formatWeekday(selectedDate!)}
                {", "}
                {formatTime(selectedSlot.startAt)} – {formatTime(selectedSlot.endAt)}
              </p>
            </div>
            <p className="font-heading text-xl font-bold text-primary">{pricePerSession.toLocaleString("ru")} ₽</p>
          </div>
        )}

        {/* Кнопка */}
        <Button className="w-full" size="lg" onClick={handleBook}
          disabled={booking || (slots.length > 0 && !selectedSlot)}>
          {booking ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Оформляем...
            </span>
          ) : !session ? (
            "Войти и записаться"
          ) : selectedSlot ? (
            `Записаться · ${pricePerSession.toLocaleString("ru")} ₽`
          ) : (
            "Выберите время"
          )}
        </Button>

        {/* Фикс 4: убрано "Бесплатно"; фикс 5: убрана "Карта не нужна" */}
        {!session && slots.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Для записи нужен аккаунт ETerapy
          </p>
        )}
      </div>
    </>
  );
}
