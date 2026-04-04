"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Slot {
  id: string;
  startAt: string;
  endAt: string;
}

export function SlotPicker({
  practitionerId,
  practitionerName,
  pricePerSession,
}: {
  practitionerId: string;
  practitionerName: string;
  pricePerSession: number;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    fetch(`/api/slots?practitionerId=${practitionerId}`)
      .then((r) => r.json())
      .then((d) => { setSlots(d.slots || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [practitionerId]);

  async function handleBook() {
    if (!session) {
      toast("Нужен аккаунт", {
        description: "Зарегистрируйтесь чтобы записаться",
        action: { label: "Регистрация", onClick: () => router.push("/register") },
      });
      return;
    }

    setBooking(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practitionerId, slotId: selectedSlot?.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setBooked(true);
        toast.success("Запись оформлена!", {
          description: `${practitionerName} получит уведомление. Письмо отправлено на ваш email.`,
        });
      } else {
        toast.error(data.error || "Не удалось забронировать");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setBooking(false);
    }
  }

  if (booked) {
    return (
      <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
        <p className="text-2xl">✅</p>
        <p className="mt-2 font-medium text-green-400">Запись оформлена!</p>
        <p className="mt-1 text-sm text-muted-foreground">Проверьте email — мы отправили подтверждение.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Выбор слота */}
      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Загружаем доступное время...</p>
      ) : slots.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium">Выберите время:</p>
          <div className="grid grid-cols-2 gap-2">
            {slots.map((slot) => {
              const start = new Date(slot.startAt);
              const isSelected = selectedSlot?.id === slot.id;
              return (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlot(isSelected ? null : slot)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <p className="font-medium">
                    {start.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  <p className="text-xs">
                    {start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/70">
          Практик пока не добавил слоты. Вы можете отправить запрос без указания времени.
        </p>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleBook}
        disabled={booking}
      >
        {booking ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Отправляем...
          </span>
        ) : session ? (
          selectedSlot ? `Записаться · ${pricePerSession.toLocaleString("ru")} ₽` : "Записаться (без слота)"
        ) : (
          "Зарегистрироваться и записаться"
        )}
      </Button>

      {!session && (
        <p className="text-center text-xs text-muted-foreground">Для записи нужен аккаунт · Бесплатно</p>
      )}
    </div>
  );
}
