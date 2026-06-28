"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { MEETING_CONTEXT_MAX, validateMeetingContext } from "@/lib/booking-context";

interface PriceRate {
  durationMin: number;
  priceRub: number;
  enabled: boolean;
}

interface AvailableSlot {
  slotId?: string;
  startAt: string;
  endAt: string;
  earlyAccess?: boolean;
}

const DURATION_LABELS: Record<number, string> = {
  15: "15 мин", 30: "30 мин", 45: "45 мин",
  60: "1 ч", 90: "1.5 ч", 120: "2 ч",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** "YYYY-MM-DD" in local timezone — avoids UTC off-by-one near midnight. */
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

export function SlotPicker({
  practitionerId,
  practitionerName,
  askContext = true,
  prefillContext = "",
}: {
  practitionerId: string;
  practitionerName: string;
  pricePerSession?: number;
  sessionDuration?: number;
  // B379: спрашивать ли контекст встречи (false для повторной записи к тому же
  // специалисту) и значение для предзаполнения (перенос из диалога).
  askContext?: boolean;
  prefillContext?: string;
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
  const [meetingContext, setMeetingContext] = useState(prefillContext);
  // B458 (item 14): обязательный контекст при первой записи (askContext).
  const [contextError, setContextError] = useState<string | null>(null);
  // B458 (items 12–13): реальная месячная доступность из /api/slots/month —
  // подсветка только рабочих дней, авто-переход на первый месяц с записью и
  // авто-выбор ближайшей даты (слоты видны сразу, без клика по календарю).
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const autoJumpDone = useRef(false);

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

  // B458: месячная доступность — какие дни реально открыты + ближайшая дата.
  useEffect(() => {
    if (!selectedDuration) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingMonth(true);
      fetch(`/api/slots/month?practitionerId=${practitionerId}&year=${selectedYear}&month=${selectedMonth}&durationMin=${selectedDuration}`)
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          const dates: string[] = Array.isArray(d.availableDates) ? d.availableDates : [];
          const earliest: string | null = d.earliestAvailableDate ?? null;
          setAvailableDates(dates);
          setLoadingMonth(false);

          // Один авто-проход: пустой месяц + доступная дата дальше → перепрыгнуть.
          const isFirstLoad = !autoJumpDone.current;
          autoJumpDone.current = true;
          if (isFirstLoad && dates.length === 0 && earliest) {
            const [ey, em] = earliest.split("-").map(Number);
            if (ey !== selectedYear || em - 1 !== selectedMonth) {
              setSelectedMonth(em - 1);
              setSelectedYear(ey);
              return; // перезапрос для нового месяца авто-выберет дату
            }
          }
          // Авто-выбор ближайшей даты месяца, если дата ещё не выбрана.
          if (dates.length > 0) setSelectedDate(prev => prev ?? dates[0]);
        })
        .catch(() => { if (!cancelled) setLoadingMonth(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [practitionerId, selectedDuration, selectedMonth, selectedYear]);

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

    const rate = rates.find(r => r.durationMin === selectedDuration);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId,
          slotId: selectedSlot.slotId,
          slotStartAt: selectedSlot.startAt,
          slotEndAt: selectedSlot.endAt,
          durationMin: selectedDuration,
          priceOverride: rate?.priceRub,
          meetingContext: askContext ? meetingContext : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Z1a/Баг 16: если для сессии создан карт-холд — ведём клиента на ЮKassa
        // для авторизации платежа (средства резервируются, спишутся при старте).
        if (data.confirmationUrl) {
          toast.success("Запись создана — подтвердите оплату картой");
          window.location.href = data.confirmationUrl;
          return;
        }
        setBooked(true);
        // Баг 16: одно-таповый холд по привязанной карте — оплата уже зарезервирована.
        toast.success(data.heldViaSavedCard
          ? "Запись оформлена — оплата зарезервирована с привязанной карты"
          : "Запись оформлена!");
      } else {
        toast.error(data.error ?? "Не удалось забронировать");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setBooking(false); }
  }

  function handleBook() {
    if (status === "loading") return;
    if (!selectedSlot) { toast.error("Выберите время"); return; }
    // B415: the login modal was retired — a guest goes to the full /login page and
    // returns to this practitioner page (?next=) to pick a slot and book once in.
    if (!session) {
      if (typeof window !== "undefined") {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `${loginUrl()}?next=${next}`;
      }
      return;
    }
    // B458 (item 14): контекст обязателен при первой записи к специалисту
    // (askContext). Сервер дублирует проверку — это быстрый клиентский барьер.
    if (askContext) {
      const check = validateMeetingContext(meetingContext, { required: true });
      if (!check.ok) {
        setContextError(check.error);
        toast.error(check.error);
        document.getElementById("meeting-context")?.focus();
        return;
      }
      setContextError(null);
    }
    doBook();
  }

  // B458: доступность дня берётся из месячного ответа сервера (реальные слоты),
  // а не из «любой будущий день». Set — для быстрого поиска по строке даты.
  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);

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
      const isAvail = availableSet.has(localDateStr(date));
      const isToday = date.toDateString() === new Date().toDateString();
      days.push({ date, isAvailable: isAvail, isToday });
    }
    // B458 (item 13): дорисовываем только до конца последней недели месяца
    // (5 недель, когда месяц укладывается) — без всегда-присутствующей 6-й
    // строки серых дней следующего месяца.
    const weeks = Math.ceil(days.length / 7);
    const remaining = weeks * 7 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(last);
      d.setDate(d.getDate() + i);
      days.push({ date: d, isAvailable: false, isToday: false });
    }
    return days;
  }, [selectedYear, selectedMonth, availableSet]);

  const selectedRate = rates.find(r => r.durationMin === selectedDuration);
  const isTodaySelected = selectedDate === todayDateStr;

  if (booked) {
    return (
      <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="font-heading text-lg font-semibold text-green-400">Запись оформлена!</p>
        <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
          Встреча с {practitionerName} появится в <a href={appUrl("/bookings")} className="text-primary hover:underline">кабинете</a>.
        </p>
      </div>
    );
  }

  if (rates.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-border/30 bg-card/20 px-4 py-3">
        <p className="text-sm text-[var(--soft-ink-soft)]">{practitionerName} пока не настроил(а) расписание.</p>
      </div>
    );
  }

  return (
      <div className="mt-4 space-y-5">
        {/* B379/B458: «контекст встречи» — спрашиваем только при первой записи к
            специалисту (askContext); при повторной — пропускаем. B458 (item 14):
            при первой записи это поле ОБЯЗАТЕЛЬНО. */}
        {askContext && (
          <div data-testid="meeting-context-field">
            <label
              htmlFor="meeting-context"
              className="text-xs font-medium text-[var(--soft-ink-soft)] mb-2 block uppercase tracking-wide"
            >
              С чем хотите разобраться?
              <span className="ml-1 text-[var(--soft-terracotta-dark)]" aria-hidden="true">*</span>
            </label>
            <textarea
              id="meeting-context"
              value={meetingContext}
              onChange={(e) => { setMeetingContext(e.target.value.slice(0, MEETING_CONTEXT_MAX)); if (contextError) setContextError(null); }}
              maxLength={MEETING_CONTEXT_MAX}
              rows={3}
              required
              aria-invalid={contextError ? true : undefined}
              placeholder="Коротко опишите ситуацию или вопрос — специалист увидит это в заявке и подготовится к встрече."
              className={`w-full resize-none rounded-[var(--soft-radius-lg)] border bg-[var(--soft-paper-card)] px-3 py-2 text-sm text-[var(--soft-ink)] placeholder:text-[var(--soft-ink-faint)] ${
                contextError ? "border-red-400" : "border-[var(--soft-paper-edge)]"
              }`}
            />
            {contextError ? (
              <p className="mt-1 text-[11px] text-red-500" data-testid="meeting-context-error">{contextError}</p>
            ) : (
              <p className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">
                Виден только выбранному специалисту. {meetingContext.length}/{MEETING_CONTEXT_MAX}
              </p>
            )}
          </div>
        )}

        {/* Шаг 1: Длительность — компактные чипы */}
        <div>
          <p className="text-xs font-medium text-[var(--soft-ink-soft)] mb-2 uppercase tracking-wide">Формат сессии</p>
          <div className="flex flex-wrap gap-1.5">
            {rates.map(rate => (
              <button key={rate.durationMin}
                onClick={() => { setSelectedDuration(rate.durationMin); setSelectedSlot(null); setSlots([]); setSelectedDate(null); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                  selectedDuration === rate.durationMin
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]/30 hover:text-[var(--soft-ink)]"
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
                  <div key={day} className="text-[10px] font-medium text-[var(--soft-ink-soft)]/60 py-1">{day}</div>
                ))}
              </div>
              <div className={`grid grid-cols-7 gap-1 transition-opacity ${loadingMonth ? "opacity-50" : ""}`}>
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
                        !thisMonth ? "text-[var(--soft-ink-faint)]/30" :
                        !day.isAvailable ? "text-[var(--soft-ink-faint)]/25 cursor-not-allowed" :
                        isSelected ? "bg-[var(--soft-bordeaux)] text-white font-semibold" :
                        // B353/Интерфейс 10: доступные дни — тёплая подсветка (apricot),
                        // чтобы было видно, какие даты открыты для записи, без пестроты.
                        day.isToday ? "bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)] font-semibold ring-1 ring-[var(--soft-bordeaux)]/40" :
                        "bg-[var(--soft-apricot)]/55 text-[var(--soft-bordeaux)] font-medium hover:bg-[var(--soft-apricot)]"
                      }`}>
                      {day.date.getDate()}
                      {day.isToday && thisMonth && (
                        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] text-[var(--soft-bordeaux)]/70 font-medium leading-none whitespace-nowrap">
                          сегодня
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {!loadingMonth && availableDates.length === 0 && (
              <p className="mt-2 text-[11px] text-[var(--soft-ink-faint)]" data-testid="month-no-availability">
                В этом месяце свободных дат нет — посмотрите соседние месяцы стрелками выше.
              </p>
            )}
          </div>
        )}

        {/* Шаг 3: Время — компактные плитки */}
        {selectedDate && selectedDuration && (
          <div>
            <p className="text-xs font-medium text-[var(--soft-ink-soft)] mb-2 uppercase tracking-wide">
              {isTodaySelected ? "Сегодня" : new Date(selectedDate + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" })}
            </p>
            {loadingSlots ? (
              <p className="text-xs text-[var(--soft-ink-soft)] animate-pulse">Загрузка...</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-[var(--soft-ink-soft)]">
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
                          ? "border-[var(--soft-bordeaux)] bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)]"
                          : isSoon
                          ? "border-amber-500/50 text-[var(--soft-ink)] hover:border-amber-500"
                          : "border-[var(--soft-paper-edge)] text-[var(--soft-ink)] hover:border-[var(--soft-bordeaux)]/40"
                      }`}>
                      <span>{formatTime(slot.startAt)}</span>
                      {slot.earlyAccess && (
                        <span className="ml-1 align-middle text-[10px] font-sans text-[var(--soft-bordeaux)]">Premium</span>
                      )}
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
              <p className="text-xs text-[var(--soft-ink-soft)]">Выбрано</p>
              <p className="text-sm font-medium">
                {new Date(selectedSlot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                {" · "}
                {formatTime(selectedSlot.startAt)}
                {" · "}
                {DURATION_LABELS[selectedRate.durationMin]}
                {selectedSlot.earlyAccess ? " · ранний доступ Premium" : ""}
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
  );
}
