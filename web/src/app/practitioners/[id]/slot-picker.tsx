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
    // Включаем сегодня и будущие даты (время не важно, сравниваем только даты)
    if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      result.push(new Date(d));
    }
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
    const isToday = selectedDate === new Date().toISOString().split("T")[0];
    fetch(`/api/slots/available?practitionerId=${practitionerId}&date=${selectedDate}&durationMin=${selectedDuration}`)
      .then(r => r.json())
      .then(d => {
        let slots = d.slots ?? [];
        // Если выбрана сегодняшняя дата, фильтруем прошедшие времена
        if (isToday) {
          const now = new Date();
          slots = slots.filter((slot: AvailableSlot) => new Date(slot.startAt) > now);
        }
        setSlots(slots);
        setLoadingSlots(false);
      })
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

  // Календарь: дни выбранного месяца
  const calendarDays = useMemo(() => {
    const first = new Date(selectedYear, selectedMonth, 1);
    const last = new Date(selectedYear, selectedMonth + 1, 0);
    const startDay = first.getDay(); // 0=вс
    const days: Array<{ date: Date; isAvailable: boolean; isToday: boolean }> = [];
    // Предыдущий месяц (неактивные)
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(first);
      d.setDate(d.getDate() - i);
      days.push({ date: d, isAvailable: false, isToday: false });
    }
    // Текущий месяц
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(selectedYear, selectedMonth, d);
      const isAvail = monthDates.some(ad => ad.getDate() === d && ad.getMonth() === selectedMonth && ad.getFullYear() === selectedYear);
      const isToday = date.toDateString() === new Date().toDateString();
      days.push({ date, isAvailable: isAvail, isToday });
    }
    // Следующий месяц (заполняем до 42 cells = 6 weeks)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(last);
      d.setDate(d.getDate() + i);
      days.push({ date: d, isAvailable: false, isToday: false });
    }
    return days;
  }, [selectedYear, selectedMonth, monthDates]);

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

        {/* Шаг 2: Календарь */}
        {selectedDuration && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Выберите день</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const newMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
                    const newYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
                    setSelectedMonth(newMonth);
                    setSelectedYear(newYear);
                    setSelectedDate(null); setSlots([]);
                  }}
                  className="rounded-lg border border-border/40 px-2 py-1 text-xs hover:border-primary/40"
                >
                  ◀
                </button>
                <button
                  onClick={() => {
                    const newMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
                    const newYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
                    setSelectedMonth(newMonth);
                    setSelectedYear(newYear);
                    setSelectedDate(null); setSlots([]);
                  }}
                  className="rounded-lg border border-border/40 px-2 py-1 text-xs hover:border-primary/40"
                >
                  ▶
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-border/20 bg-card/10 p-3">
              {/* Дни недели */}
              <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                {["Вс","Пн","Вт","Ср","Чт","Пт","Сб"].map(day => (
                  <div key={day} className="text-xs text-muted-foreground py-1">{day}</div>
                ))}
              </div>
              {/* Сетка дней */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const isSelected = selectedDate === day.date.toISOString().split("T")[0];
                  const isPast = day.date < new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), 0, 0, 0);
                  return (
                    <button
                      key={idx}
                      disabled={!day.isAvailable || isPast || day.date.getMonth() !== selectedMonth}
                      onClick={() => {
                        if (day.isAvailable && !isPast && day.date.getMonth() === selectedMonth) {
                          setSelectedDate(day.date.toISOString().split("T")[0]);
                          setSelectedSlot(null);
                          setSlots([]);
                        }
                      }}
                      className={`rounded-lg p-2 text-sm transition-colors ${
                        day.date.getMonth() !== selectedMonth
                          ? "text-muted-foreground/30"
                          : !day.isAvailable
                          ? "text-muted-foreground/20 cursor-not-allowed"
                          : isSelected
                          ? "bg-primary text-primary-foreground"
                          : day.isToday
                          ? "border border-primary/50 text-primary hover:bg-primary/10"
                          : "text-foreground hover:bg-primary/5"
                      }`}
                    >
                      {day.date.getDate()}
                    </button>
                  );
                })}
              </div>
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
