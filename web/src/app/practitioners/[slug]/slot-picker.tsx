"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";
import { appUrl } from "@/lib/subdomain";

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
  15: "15 мин", 30: "30 мин", 45: "45 мин",
  60: "1 ч", 90: "1.5 ч", 120: "2 ч",
};

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** "YYYY-MM-DD" in local timezone — avoids UTC off-by-one near midnight. */
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getAvailableDates(month: number, year: number): Date[] {
  const now = new Date();
  const result: Date[] = [];
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      result.push(new Date(d));
    }
  }
  return result;
}

const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

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

  const [calendarBase] = useState(() => new Date());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [todayDateStr, setTodayDateStr] = useState(() => localDateStr());
  const [selectedMonth, setSelectedMonth] = useState(calendarBase.getMonth());
  const [selectedYear, setSelectedYear] = useState(calendarBase.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [rates, setRates] = useState<PriceRate[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      setTodayDateStr(localDateStr());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Загружаем тарифы
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/rates?practitionerId=${practitionerId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const enabled = (d.rates ?? []).filter((r: PriceRate) => r.enabled && r.priceRub > 0);
        setRates(enabled);
        if (enabled.length > 0) setSelectedDuration(enabled[0].durationMin);
      })
      .catch(() => {
        if (!cancelled) setRates([]);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [practitionerId]);

  // Загружаем слоты при выборе даты + длительности
  useEffect(() => {
    if (!selectedDate || !selectedDuration) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingSlots(true);
      setSelectedSlot(null);
      fetch(`/api/slots/available?practitionerId=${practitionerId}&date=${selectedDate}&durationMin=${selectedDuration}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        let slots = d.slots ?? [];
        if (selectedDate === todayDateStr) {
          slots = slots.filter((slot: AvailableSlot) => new Date(slot.startAt).getTime() > nowMs);
        }
        setSlots(slots);
        setLoadingSlots(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [practitionerId, selectedDate, selectedDuration, todayDateStr, nowMs]);

  async function doBook() {
    if (!selectedSlot || !selectedDuration) return;
    setBooking(true);
    setShowAuth(false);

    const rate = rates.find(r => r.durationMin === selectedDuration);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId,
          slotStartAt: selectedSlot.startAt,
          slotEndAt: selectedSlot.endAt,
          durationMin: selectedDuration,
          priceOverride: rate?.priceRub,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBooked(true);
        toast.success("Запись оформлена!");
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

  const calendarDays = useMemo(() => {
    const first = new Date(selectedYear, selectedMonth, 1);
    const last = new Date(selectedYear, selectedMonth + 1, 0);
    const startDay = (first.getDay() + 6) % 7; // 0=пн
    const days: Array<{ date: Date; isAvailable: boolean; isToday: boolean }> = [];
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(first);
      d.setDate(d.getDate() - i - 1);
      days.push({ date: d, isAvailable: false, isToday: false });
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(selectedYear, selectedMonth, d);
      const isAvail = monthDates.some(ad => ad.getDate() === d && ad.getMonth() === selectedMonth && ad.getFullYear() === selectedYear);
      const isToday = date.toDateString() === new Date().toDateString();
      days.push({ date, isAvailable: isAvail, isToday });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(last);
      d.setDate(d.getDate() + i);
      days.push({ date: d, isAvailable: false, isToday: false });
    }
    return days;
  }, [selectedYear, selectedMonth, monthDates]);

  const selectedRate = rates.find(r => r.durationMin === selectedDuration);
  const isTodaySelected = selectedDate === todayDateStr;

  if (booked) {
    return (
      <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="font-heading text-lg font-semibold text-green-400">Запись оформлена!</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Встреча с {practitionerName} появится в <a href={appUrl("/cabinet/bookings")} className="text-primary hover:underline">кабинете</a>.
        </p>
      </div>
    );
  }

  if (rates.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-border/30 bg-card/20 px-4 py-3">
        <p className="text-sm text-muted-foreground">{practitionerName} пока не настроил(а) расписание.</p>
      </div>
    );
  }

  return (
    <>
      <AuthModal toolName="записи к практику" initialMode="login" open={showAuth} onSuccess={doBook} onClose={() => setShowAuth(false)} />

      <div className="mt-4 space-y-5">
        {/* Шаг 1: Длительность — компактные чипы */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Формат сессии</p>
          <div className="flex flex-wrap gap-1.5">
            {rates.map(rate => (
              <button key={rate.durationMin}
                onClick={() => { setSelectedDuration(rate.durationMin); setSelectedSlot(null); setSlots([]); setSelectedDate(null); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                  selectedDuration === rate.durationMin
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}>
                {DURATION_LABELS[rate.durationMin]} · {rate.priceRub.toLocaleString("ru")} ₽
              </button>
            ))}
          </div>
        </div>

        {/* Шаг 2: Календарь */}
        {selectedDuration && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => {
                  const newMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
                  const newYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
                  setSelectedMonth(newMonth);
                  setSelectedYear(newYear);
                  setSelectedDate(null); setSlots([]);
                }}
                className="rounded-lg border border-border/30 px-2.5 py-1.5 text-sm hover:border-primary/40 hover:text-primary transition-colors"
              >
                ←
              </button>
              <span className="text-sm font-medium">
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </span>
              <button
                onClick={() => {
                  const newMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
                  const newYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
                  setSelectedMonth(newMonth);
                  setSelectedYear(newYear);
                  setSelectedDate(null); setSlots([]);
                }}
                className="rounded-lg border border-border/30 px-2.5 py-1.5 text-sm hover:border-primary/40 hover:text-primary transition-colors"
              >
                →
              </button>
            </div>
            <div className="rounded-xl border border-border/20 bg-card/10 p-3">
              <div className="grid grid-cols-7 gap-1 mb-1 text-center">
                {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(day => (
                  <div key={day} className="text-[10px] font-medium text-muted-foreground/60 py-1">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const isSelected = selectedDate === localDateStr(day.date);
                  const thisMonth = day.date.getMonth() === selectedMonth;
                  return (
                    <button
                      key={idx}
                      disabled={!day.isAvailable || !thisMonth}
                      onClick={() => {
                        if (day.isAvailable && thisMonth) {
                          setSelectedDate(localDateStr(day.date));
                          setSelectedSlot(null);
                          setSlots([]);
                        }
                      }}
                      className={`relative rounded-lg p-1.5 text-xs transition-colors ${
                        !thisMonth ? "text-muted-foreground/20" :
                        !day.isAvailable ? "text-muted-foreground/15 cursor-not-allowed" :
                        isSelected ? "bg-primary text-white font-semibold" :
                        day.isToday ? "ring-1 ring-primary/50 text-primary font-medium" :
                        "text-foreground hover:bg-primary/5"
                      }`}>
                      {day.date.getDate()}
                      {day.isToday && thisMonth && (
                        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] text-primary/70 font-medium leading-none whitespace-nowrap">
                          сегодня
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Шаг 3: Время — компактные плитки */}
        {selectedDate && selectedDuration && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              {isTodaySelected ? "Сегодня" : new Date(selectedDate + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" })}
            </p>
            {loadingSlots ? (
              <p className="text-xs text-muted-foreground animate-pulse">Загрузка...</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {isTodaySelected ? "Сегодня свободных окон нет." : "Нет свободных слотов на этот день."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {slots.map((slot, i) => {
                  const isSelected = selectedSlot?.startAt === slot.startAt;
                  const slotDate = new Date(slot.startAt);
                  const isSoon = isTodaySelected && slotDate.getTime() - nowMs < 3600000; // < 1 часа
                  return (
                    <button key={i} onClick={() => setSelectedSlot(isSelected ? null : slot)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-mono font-medium transition-all relative ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : isSoon
                          ? "border-amber-400/40 text-foreground hover:border-amber-400"
                          : "border-border/30 text-foreground hover:border-primary/40"
                      }`}>
                      {formatTime(slot.startAt)}
                      {isSoon && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Итого + кнопка */}
        {selectedSlot && selectedRate && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Выбрано</p>
              <p className="text-sm font-medium">
                {new Date(selectedSlot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                {" · "}
                {formatTime(selectedSlot.startAt)}
                {" · "}
                {DURATION_LABELS[selectedRate.durationMin]}
              </p>
            </div>
            <p className="text-lg font-bold text-primary">{selectedRate.priceRub.toLocaleString("ru")} ₽</p>
          </div>
        )}

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
      </div>
    </>
  );
}
