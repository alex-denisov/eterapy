"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";

interface PriceRate {
  durationMin: number;
  priceRub: number;
  enabled: boolean;
}

interface AvailableSlot {
  startAt: string;
  endAt: string;
}

const DURATION_LABELS: Record<number, string> = {
  15: "15 минут", 30: "30 минут", 45: "45 минут",
  60: "1 час", 90: "1.5 часа", 120: "2 часа",
};

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Генерируем даты: сегодня + 60 дней
function getAvailableDates(month: number, year: number): Date[] {
  const now = new Date();
  const result: Date[] = [];
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (d > now) result.push(new Date(d));
  }
  return result;
}

export function SlotPicker({
  practitionerId,
  practitionerName,
}: {
  practitionerId: string;
  practitionerName: string;
  pricePerSession?: number;
  sessionDuration?: number;
}) {
  const { data: session, status } = useSession();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [rates, setRates] = useState<PriceRate[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  // Загружаем тарифы
  useEffect(() => {
    fetch(`/api/rates?practitionerId=${practitionerId}`)
      .then(r => r.json())
      .then(d => {
        const enabled = (d.rates ?? []).filter((r: PriceRate) => r.enabled && r.priceRub > 0);
        setRates(enabled);
        if (enabled.length > 0) setSelectedDuration(enabled[0].durationMin);
      });
  }, [practitionerId]);

  // Загружаем слоты при выборе даты + длительности
  useEffect(() => {
    if (!selectedDate || !selectedDuration) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    fetch(`/api/slots/available?practitionerId=${practitionerId}&date=${selectedDate}&durationMin=${selectedDuration}`)
      .then(r => r.json())
      .then(d => { setSlots(d.slots ?? []); setLoadingSlots(false); })
      .catch(() => setLoadingSlots(false));
  }, [practitionerId, selectedDate, selectedDuration]);

  async function doBook() {
    if (!selectedSlot || !selectedDuration) return;
    setBooking(true);
    setShowAuth(false);

    // Создаём TimeSlot и бронирование
    const rate = rates.find(r => r.durationMin === selectedDuration);
    try {
      // Сначала создаём слот
      const slotRes = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: selectedSlot.startAt, endAt: selectedSlot.endAt }),
      });
      const slotData = await slotRes.json();
      // slotData.slot может быть null если нет совпадений — используем существующий
      const slotId = slotData.slot?.id;

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId,
          slotId,
          durationMin: selectedDuration,
          priceOverride: rate?.priceRub,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBooked(true);
        toast.success("Запись оформлена!", { description: "Письма отправлены вам и практику." });
      } else {
        toast.error(data.error ?? "Не удалось забронировать");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setBooking(false); }
  }

  function handleBook() {
    if (status === "loading") return;
    if (!selectedSlot) { toast.error("Выберите время"); return; }
    if (!session) { setShowAuth(true); return; }
    doBook();
  }

  const monthDates = useMemo(() => getAvailableDates(selectedMonth, selectedYear), [selectedMonth, selectedYear]);

  // Генерируем месяцы для селектора (текущий + 3)
  const monthOptions = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { month: d.getMonth(), year: d.getFullYear(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    });
  }, []);

  const selectedRate = rates.find(r => r.durationMin === selectedDuration);

  if (booked) {
    return (
      <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="font-heading text-lg font-semibold text-green-400">Запись оформлена!</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Следите за статусом в <a href="/cabinet/bookings" className="text-primary hover:underline">кабинете</a>.
        </p>
      </div>
    );
  }

  if (rates.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-border/30 bg-card/20 px-4 py-3">
        <p className="text-sm text-muted-foreground">Практик пока не настроил расписание.</p>
      </div>
    );
  }

  return (
    <>
      {showAuth && (
        <AuthModal toolName="записи к практику" initialMode="login" onSuccess={doBook} onClose={() => setShowAuth(false)} />
      )}

      <div className="mt-4 space-y-4">
        {/* Шаг 1: Длительность */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Длительность и цена:</p>
          <div className="flex flex-wrap gap-2">
            {rates.map(rate => (
              <button key={rate.durationMin}
                onClick={() => { setSelectedDuration(rate.durationMin); setSelectedSlot(null); setSlots([]); setSelectedDate(null); }}
                className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                  selectedDuration === rate.durationMin
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border/40 text-muted-foreground hover:border-primary/40"
                }`}>
                <p className="font-medium">{DURATION_LABELS[rate.durationMin]}</p>
                <p className="text-xs mt-0.5">{rate.priceRub.toLocaleString("ru")} ₽</p>
              </button>
            ))}
          </div>
        </div>

        {/* Шаг 2: Месяц + День */}
        {selectedDuration && (
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Месяц</p>
              <select
                value={`${selectedMonth}-${selectedYear}`}
                onChange={e => {
                  const [m, y] = e.target.value.split("-").map(Number);
                  setSelectedMonth(m); setSelectedYear(y);
                  setSelectedDate(null); setSlots([]);
                }}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                {monthOptions.map(o => (
                  <option key={o.label} value={`${o.month}-${o.year}`}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">День</p>
              <select
                value={selectedDate ?? ""}
                onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null); }}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                <option value="">Выберите день</option>
                {monthDates.map(d => (
                  <option key={isoDate(d)} value={isoDate(d)}>
                    {d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Шаг 3: Временные плитки */}
        {selectedDate && selectedDuration && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Доступное время:</p>
            {loadingSlots ? (
              <p className="text-sm text-muted-foreground animate-pulse">Загружаем...</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет доступных слотов на этот день.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot, i) => {
                  const isSelected = selectedSlot?.startAt === slot.startAt;
                  return (
                    <button key={i} onClick={() => setSelectedSlot(isSelected ? null : slot)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary shadow-[0_0_8px_rgba(201,168,76,0.2)]"
                          : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}>
                      {formatTime(slot.startAt)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Итого */}
        {selectedSlot && selectedRate && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Выбрано</p>
              <p className="text-sm font-medium">
                {new Date(selectedSlot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}
                {", "}
                {formatTime(selectedSlot.startAt)}
                {" · "}
                {DURATION_LABELS[selectedRate.durationMin]}
              </p>
            </div>
            <p className="font-heading text-xl font-bold text-primary">{selectedRate.priceRub.toLocaleString("ru")} ₽</p>
          </div>
        )}

        {/* Кнопка */}
        <Button className="w-full" size="lg" onClick={handleBook}
          disabled={booking || !selectedSlot}>
          {booking ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Оформляем...
            </span>
          ) : !session ? "Войти и записаться"
            : selectedSlot ? `Записаться · ${selectedRate?.priceRub.toLocaleString("ru")} ₽`
            : "Выберите время"}
        </Button>

        {!session && rates.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Для записи нужен аккаунт ETerapy
          </p>
        )}
      </div>
    </>
  );
}
