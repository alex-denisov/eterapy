"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CaretLeft, CaretRight, Check, Clock, ShieldCheck } from "@phosphor-icons/react";
import {
  MEETING_CONTEXT_MAX,
  validateMeetingContext,
} from "@/lib/booking-context";
import type { MiniAppPractitionerCard } from "@/lib/miniapp/journey-data";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { PractitionerAvatar, PageHead } from "@/components/miniapp/subpage-ui";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

type Slot = { id?: string; slotId?: string; startAt: string; endAt: string };

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

/** YYYY-MM-DD в местном времени — как на вебе (`/api/slots/*` ждёт именно её). */
function localDateStr(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * B557: календарь месяца. Сетка начинается с понедельника и дорисовывается
 * только до конца последней недели месяца — шестая строка серых дней появляется
 * лишь когда месяц реально в неё заходит.
 */
function monthGrid(year: number, month: number, available: Set<string>, today: string) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const lead = (first.getDay() + 6) % 7;
  const days: Array<{ key: string; date: Date; inMonth: boolean; isAvailable: boolean; isToday: boolean }> = [];

  for (let i = lead; i > 0; i -= 1) {
    const date = new Date(year, month, 1 - i);
    days.push({ key: localDateStr(date), date, inMonth: false, isAvailable: false, isToday: false });
  }
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const key = localDateStr(date);
    days.push({ key, date, inMonth: true, isAvailable: available.has(key), isToday: key === today });
  }
  const tail = Math.ceil(days.length / 7) * 7 - days.length;
  for (let i = 1; i <= tail; i += 1) {
    const date = new Date(year, month + 1, i);
    days.push({ key: localDateStr(date), date, inMonth: false, isAvailable: false, isToday: false });
  }
  return days;
}

/**
 * Экран записи к специалисту.
 *
 * B554 (round 4) починил ИСТОЧНИК данных: расписание задано недельными
 * правилами, слоты генерируются на лету (`/api/slots/month` + `/api/slots/available`),
 * а не лежат строками в `time_slots`. B557 меняет ПОДАЧУ: вместо простыни из
 * всех слотов за неделю — календарь, как на вебе, и время только выбранного дня.
 *
 * Контекст встречи (B379/B458) спрашиваем при первой записи к этому
 * специалисту. Текст чувствительный, поэтому он не уходит в query-строку:
 * бронь создаётся здесь же, тем же `POST /api/bookings`, что и на вебе, —
 * ручка сама держит холд оплаты и дублирует проверку контекста на сервере.
 */
export function PractitionerBookingScreen({
  practitioner,
  askContext,
}: {
  practitioner: MiniAppPractitionerCard;
  askContext: boolean;
}) {
  const { data } = useMiniAppV21();
  const [base] = useState(() => new Date());
  const today = useMemo(() => localDateStr(base), [base]);
  const [year, setYear] = useState(() => base.getFullYear());
  const [month, setMonth] = useState(() => base.getMonth());
  const [monthAvailability, setMonthAvailability] = useState<{ key: string; dates: string[] }>({
    key: "",
    dates: [],
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotAvailability, setSlotAvailability] = useState<{ key: string; slots: Slot[] }>({
    key: "",
    slots: [],
  });
  const [selected, setSelected] = useState("");
  const [meetingContext, setMeetingContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookedId, setBookedId] = useState<string | null>(null);
  const autoJumped = useRef(false);

  const duration = practitioner.durationMin;
  const isCurrentMonth = year === base.getFullYear() && month === base.getMonth();
  const monthRequestKey = `${practitioner.id}:${duration}:${year}:${month}`;
  const availableDates = useMemo(
    () => (monthAvailability.key === monthRequestKey ? monthAvailability.dates : []),
    [monthAvailability, monthRequestKey],
  );
  const loadingMonth = monthAvailability.key !== monthRequestKey;
  const slotRequestKey = selectedDate
    ? `${practitioner.id}:${duration}:${selectedDate}:${today}`
    : "";
  const slots = slotAvailability.key === slotRequestKey ? slotAvailability.slots : [];
  const loadingSlots = Boolean(selectedDate && slotAvailability.key !== slotRequestKey);

  // Доступные дни месяца. Если в текущем месяце свободного времени нет, один
  // раз перепрыгиваем на месяц ближайшей доступной даты — иначе клиент видит
  // пустую сетку и решает, что записаться нельзя.
  useEffect(() => {
    let cancelled = false;
    const id = encodeURIComponent(practitioner.id);
    fetch(`/api/slots/month?practitionerId=${id}&year=${year}&month=${month}&durationMin=${duration}`)
      .then((response) => (response.ok ? response.json() : { availableDates: [] }))
      .then((payload: { availableDates?: string[]; earliestAvailableDate?: string | null }) => {
        if (cancelled) return;
        const dates = Array.isArray(payload.availableDates) ? payload.availableDates : [];
        setMonthAvailability({ key: monthRequestKey, dates });

        const firstLoad = !autoJumped.current;
        autoJumped.current = true;
        if (firstLoad && dates.length === 0 && payload.earliestAvailableDate) {
          const [jumpYear, jumpMonth] = payload.earliestAvailableDate.split("-").map(Number);
          if (jumpYear !== year || jumpMonth - 1 !== month) {
            setYear(jumpYear);
            setMonth(jumpMonth - 1);
            return;
          }
        }
        // По умолчанию — сегодня, если этот день открыт; иначе ближайший день
        // со свободным временем.
        if (dates.length > 0) setSelectedDate((prev) => prev ?? (dates.includes(today) ? today : dates[0]));
      })
      .catch(() => {
        if (!cancelled) setMonthAvailability({ key: monthRequestKey, dates: [] });
      });
    return () => { cancelled = true; };
  }, [practitioner.id, duration, year, month, today, monthRequestKey]);

  // Время выбранного дня. Для сегодня отбрасываем уже прошедшие слоты.
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    const id = encodeURIComponent(practitioner.id);
    fetch(`/api/slots/available?practitionerId=${id}&date=${selectedDate}&durationMin=${duration}`)
      .then((response) => (response.ok ? response.json() : { slots: [] }))
      .then((payload: { slots?: Slot[] }) => {
        if (cancelled) return;
        const list = Array.isArray(payload.slots) ? payload.slots : [];
        const now = Date.now();
        setSlotAvailability({
          key: slotRequestKey,
          slots: selectedDate === today
            ? list.filter((item) => new Date(item.startAt).getTime() > now)
            : list,
        });
      })
      .catch(() => {
        if (!cancelled) setSlotAvailability({ key: slotRequestKey, slots: [] });
      });
    return () => { cancelled = true; };
  }, [practitioner.id, duration, selectedDate, today, slotRequestKey]);

  // Сгенерированные по правилу слоты приходят БЕЗ id — ключом служит startAt.
  const slotKey = (item: Slot) => item.id ?? item.slotId ?? item.startAt;
  const slot = slots.find((item) => slotKey(item) === selected) ?? null;
  const days = useMemo(
    () => monthGrid(year, month, new Set(availableDates), today),
    [year, month, availableDates, today],
  );

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    if (delta < 0 && (next.getFullYear() < base.getFullYear()
      || (next.getFullYear() === base.getFullYear() && next.getMonth() < base.getMonth()))) return;
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setSelected("");
  }

  async function submit() {
    if (!slot) return;
    setError(null);
    if (askContext) {
      const check = validateMeetingContext(meetingContext, { required: true });
      if (!check.ok) { setError(check.error); return; }
    }
    setBooking(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId: practitioner.id,
          slotId: slot.id ?? slot.slotId,
          slotStartAt: slot.startAt,
          slotEndAt: slot.endAt,
          meetingContext: askContext ? meetingContext : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        booking?: { id: string }; confirmationUrl?: string | null; error?: string;
      };
      if (!response.ok) {
        setError(response.status === 401
          ? "Сессия истекла. Войдите в аккаунт и повторите запись."
          : payload.error ?? "Не удалось записаться. Попробуйте ещё раз.");
        return;
      }
      if (payload.confirmationUrl) { window.location.assign(payload.confirmationUrl); return; }
      setBookedId(payload.booking?.id ?? null);
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setBooking(false);
    }
  }

  if (bookedId) {
    return (
      <MiniAppChrome data={data}>
        <div className={styles.subpage} data-testid="miniapp-booking-done">
          <PageHead back="/miniapp/practitioners" eyebrow="запись" title="Вы записаны" description={practitioner.name} />
          <section className={styles["conversation-card"]}>
            <span><Check size={22} /><strong>Встреча в календаре</strong></span>
            <p>
              {slot
                ? new Date(slot.startAt).toLocaleString("ru-RU", {
                    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                  })
                : "Время встречи сохранено в профиле"}
              {askContext ? " · специалист получил ваш запрос" : ""}
            </p>
          </section>
          <Link className={styles["journey-primary"]} href="/miniapp/profile">Мои записи <ArrowRight size={18} /></Link>
        </div>
      </MiniAppChrome>
    );
  }

  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-booking">
        <PageHead
          back={`/miniapp/practitioners/${practitioner.slug}`}
          eyebrow="запись"
          title="Выберите время"
          description={`${practitioner.name} · ${practitioner.durationMin} минут`}
        />
        <section className={styles["booking-person"]}>
          <PractitionerAvatar practitioner={practitioner} />
          <div><strong>{practitioner.name}</strong><span>{practitioner.priceRub.toLocaleString("ru-RU")} ₽ за встречу</span></div>
        </section>

        <section className={styles["booking-calendar"]} aria-label="Календарь">
          <header>
            <button type="button" onClick={() => shiftMonth(-1)} disabled={isCurrentMonth} aria-label="Предыдущий месяц">
              <CaretLeft size={16} weight="bold" />
            </button>
            <strong>{MONTHS[month]} {year}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
              <CaretRight size={16} weight="bold" />
            </button>
          </header>
          <div className={styles["calendar-weekdays"]} aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className={styles["calendar-grid"]} role="group" aria-label="Дни со свободным временем">
            {days.map((day) => (
              <button
                key={day.key}
                type="button"
                disabled={!day.isAvailable}
                aria-pressed={selectedDate === day.key}
                aria-label={day.date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                className={c(
                  "calendar-day",
                  !day.inMonth && "is-outside",
                  day.isAvailable && "is-available",
                  day.isToday && "is-today",
                  selectedDate === day.key && "is-selected",
                )}
                onClick={() => selectDate(day.key)}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
          {loadingMonth ? <p className={styles["flow-note"]}>Проверяем расписание…</p> : null}
          {!loadingMonth && availableDates.length === 0 ? (
            <p className={styles["flow-note"]}>В этом месяце свободного времени нет — посмотрите следующий.</p>
          ) : null}
        </section>

        <div id="time" className={styles["slot-chips"]} data-testid="miniapp-booking-slots">
          {loadingSlots ? <p className={styles["flow-note"]}>Загружаем время…</p> : slots.length ? slots.map((item) => {
            const key = slotKey(item);
            return (
              <button
                key={key}
                type="button"
                className={selected === key ? styles["is-selected"] : undefined}
                aria-pressed={selected === key}
                onClick={() => setSelected(key)}
              >
                {new Date(item.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </button>
            );
          }) : selectedDate && !loadingMonth ? (
            <section className={styles["empty-detail"]}>
              <Clock size={28} /><strong>В этот день время занято</strong><p>Выберите другой день в календаре.</p>
            </section>
          ) : null}
        </div>

        {askContext ? (
          <section className={styles["booking-context"]}>
            <label htmlFor="miniapp-meeting-context">
              <strong>С чем хотите разобраться?</strong>
              <small>Специалист прочитает это до встречи и подготовится.</small>
            </label>
            <textarea
              id="miniapp-meeting-context"
              value={meetingContext}
              maxLength={MEETING_CONTEXT_MAX}
              rows={4}
              placeholder="Например: второй месяц не могу решиться на разговор с руководителем"
              onChange={(event) => setMeetingContext(event.target.value)}
            />
            <small>Виден только выбранному специалисту. {meetingContext.length}/{MEETING_CONTEXT_MAX}</small>
          </section>
        ) : null}

        {error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}
        <button
          className={c("journey-primary", (!slot || booking) && "is-disabled")}
          type="button"
          disabled={!slot || booking}
          onClick={() => void submit()}
        >
          {booking ? "Записываем…" : "Записаться"}<ArrowRight size={18} />
        </button>
        <p className={styles["flow-note"]}>
          <ShieldCheck size={16} />Отмена бесплатна не позднее чем за 24 часа до встречи; позже удерживается вся стоимость.
        </p>
      </div>
    </MiniAppChrome>
  );
}
