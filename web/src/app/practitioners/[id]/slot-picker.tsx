"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";

interface Slot {
  id: string;
  startAt: string;
  endAt: string;
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
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    fetch(`/api/slots?practitionerId=${practitionerId}`)
      .then((r) => r.json())
      .then((d) => { setSlots(d.slots ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [practitionerId]);

  async function doBook() {
    if (!selectedSlot) {
      toast.error("Выберите время сессии");
      return;
    }
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
        toast.success("Запись оформлена!", {
          description: "Письма с подтверждением отправлены вам и практику.",
        });
      } else {
        toast.error(data.error ?? "Не удалось забронировать");
        // Слот мог быть занят — перезагружаем список
        if (data.error?.includes("занят")) {
          fetch(`/api/slots?practitionerId=${practitionerId}`)
            .then((r) => r.json())
            .then((d) => { setSlots(d.slots ?? []); setSelectedSlot(null); });
        }
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setBooking(false);
    }
  }

  function handleBook() {
    if (status === "loading") return;
    if (!session) { setShowAuth(true); return; }
    if (!selectedSlot) { toast.error("Выберите удобное время"); return; }
    doBook();
  }

  if (booked) {
    return (
      <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="font-heading text-lg font-semibold text-green-400">Запись оформлена!</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Мы отправили письма вам и практику. Следите за статусом в{" "}
          <a href="/cabinet/bookings" className="text-primary hover:underline">кабинете</a>.
        </p>
      </div>
    );
  }

  const durLabel = sessionDuration === 30 ? "30 мин"
    : sessionDuration === 45 ? "45 мин"
    : sessionDuration === 60 ? "1 час"
    : sessionDuration === 90 ? "1.5 часа"
    : sessionDuration === 120 ? "2 часа"
    : `${sessionDuration} мин`;

  return (
    <>
      {showAuth && (
        <AuthModal
          toolName="записи"
          onSuccess={doBook}
          onClose={() => setShowAuth(false)}
        />
      )}

      <div className="mt-4 space-y-4">
        {/* Слоты */}
        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse">Загружаем расписание...</p>
        ) : slots.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Выберите время сессии:</p>
            <div className="grid grid-cols-2 gap-2">
              {slots.map((slot) => {
                const start = new Date(slot.startAt);
                const end = new Date(slot.endAt);
                const isSelected = selectedSlot?.id === slot.id;
                return (
                  <button key={slot.id} onClick={() => setSelectedSlot(isSelected ? null : slot)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-[0_0_8px_rgba(201,168,76,0.2)]"
                        : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}>
                    <p className="font-medium">
                      {start.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    <p className="text-xs mt-0.5">
                      {start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {durLabel}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border/30 bg-card/20 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Практик пока не добавил открытые слоты.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Вы можете написать практику напрямую или вернуться позже.
            </p>
          </div>
        )}

        {/* Итого */}
        {selectedSlot && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Выбрано</p>
              <p className="text-sm font-medium">
                {new Date(selectedSlot.startAt).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" })}
                {", "}
                {new Date(selectedSlot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <p className="font-heading text-xl font-bold text-primary">{pricePerSession.toLocaleString("ru")} ₽</p>
          </div>
        )}

        {/* Кнопка */}
        <Button className="w-full" size="lg" onClick={handleBook} disabled={booking || !selectedSlot}>
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

        {!session && (
          <p className="text-center text-xs text-muted-foreground">
            Для записи нужен аккаунт ETerapy · Бесплатно
          </p>
        )}
      </div>
    </>
  );
}
