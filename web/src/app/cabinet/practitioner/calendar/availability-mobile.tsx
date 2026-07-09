"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

// B466 R9-4 P3 — мобильная «Доступность» 1-в-1 по mockup
// practitioner-calendar-availability.html: рабочие часы по дням с
// тумблерами, «Цены за сессию» (тумблеры длительностей, цены read-only),
// ссылка для записи, пояснения. Те же API, что и десктопные редакторы:
// PUT /api/schedule {rules} и PATCH /api/rates {practitionerId, rates}.
// Редактор диапазона часов на мобиле не рисуем — экрана нет в макетах
// (owner-правило: сначала новый макет).

interface Rule {
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  enabled: boolean;
}
interface Rate {
  durationMin: number;
  priceRub: number;
  enabled: boolean;
}

const DAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]; // dayOfWeek 0..6
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // отображаем Пн..Вс

function two(n: number): string {
  return n.toString().padStart(2, "0");
}
function hoursLabel(rule: Rule): string {
  return `${two(rule.startHour)}:${two(rule.startMinute)} – ${two(rule.endHour)}:${two(rule.endMinute)}`;
}

export function AvailabilityMobile({
  practitionerId,
  initialRules,
  initialRates,
  bookingUrl,
}: {
  practitionerId: string;
  initialRules: Rule[];
  initialRates: Rate[];
  bookingUrl: string;
}) {
  const [rules, setRules] = useState<Rule[]>(() =>
    DAY_ORDER.map(
      (dow) =>
        initialRules.find((r) => r.dayOfWeek === dow) ?? {
          dayOfWeek: dow,
          startHour: 10,
          startMinute: 0,
          endHour: 19,
          endMinute: 0,
          enabled: false,
        },
    ),
  );
  const [rates, setRates] = useState<Rate[]>(initialRates);
  const [copied, setCopied] = useState(false);

  async function toggleDay(dayOfWeek: number) {
    const updated = rules.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, enabled: !r.enabled } : r));
    setRules(updated);
    try {
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: updated }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Ошибка");
      toast.success("Расписание сохранено");
    } catch (error) {
      setRules(rules); // откат
      toast.error(error instanceof Error ? error.message : "Ошибка сети");
    }
  }

  async function toggleRate(durationMin: number) {
    const updated = rates.map((r) => (r.durationMin === durationMin ? { ...r, enabled: !r.enabled } : r));
    setRates(updated);
    try {
      const res = await fetch("/api/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practitionerId, rates: updated }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Ошибка");
      toast.success("Тариф обновлён");
    } catch (error) {
      setRates(rates); // откат
      toast.error(error instanceof Error ? error.message : "Ошибка сети");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard может быть недоступен — ссылка видна текстом.
    }
  }

  const shownUrl = bookingUrl.replace(/^https?:\/\//, "");

  return (
    <div data-testid="calendar-availability-mobile">
      {/* Рабочие часы */}
      <div className="pcab-section18">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Рабочие часы</span>
        </div>
        <div className="pcab-list">
          {rules.map((rule) => (
            <div key={rule.dayOfWeek} className="pcab-avday" data-testid="availability-day-mobile">
              <span className="pcab-avday-name">{DAY_LABELS[rule.dayOfWeek]}</span>
              <span className={`pcab-avday-hours${rule.enabled ? "" : " off"}`}>
                {rule.enabled ? hoursLabel(rule) : "выходной"}
              </span>
              <button
                type="button"
                className={`pcab-toggle${rule.enabled ? "" : " off"}`}
                role="switch"
                aria-checked={rule.enabled}
                aria-label={`${DAY_LABELS[rule.dayOfWeek]}: ${rule.enabled ? "рабочий" : "выходной"}`}
                onClick={() => toggleDay(rule.dayOfWeek)}
              >
                <span className="knob" />
              </button>
            </div>
          ))}
        </div>
        <div className="pcab-note">
          Клиенты записываются только в свободные слоты рабочих часов. Отдельные даты можно закрыть в сетке
          недели (десктоп-версия «Доступности»).
        </div>
      </div>

      {/* Цены за сессию */}
      <div className="pcab-section18">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Цены за сессию</span>
        </div>
        <div className="pcab-list">
          {rates.length === 0 ? (
            <div className="pcab-avday">
              <span className="pcab-avday-hours off">Тарифы ещё не настроены</span>
            </div>
          ) : (
            rates.map((rate) => (
              <div key={rate.durationMin} className={`pcab-price-row${rate.enabled ? "" : " off"}`} data-testid="availability-rate-mobile">
                <span className="pcab-price-dur">
                  Индивидуальная <small>· {rate.durationMin} мин</small>
                </span>
                <span className="pcab-price-val">{rate.priceRub.toLocaleString("ru")} ₽</span>
                <button
                  type="button"
                  className={`pcab-toggle${rate.enabled ? "" : " off"}`}
                  role="switch"
                  aria-checked={rate.enabled}
                  aria-label={`Длительность ${rate.durationMin} мин: ${rate.enabled ? "включена" : "выключена"}`}
                  onClick={() => toggleRate(rate.durationMin)}
                >
                  <span className="knob" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="pcab-note">
          Включайте длительности, которые вы проводите — выключенные не показываются клиентам при записи.
          Стоимость здесь не редактируется.
        </div>
      </div>

      {/* Ссылка для записи */}
      <div className="pcab-section18">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Ссылка для записи</span>
        </div>
        <div className="pcab-linkcard" data-testid="availability-link-mobile">
          <div className="pcab-linkcard-ic">
            <Link2 width={19} height={19} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="pcab-linkcard-main">
            <div className="pcab-linkcard-t">{shownUrl}</div>
            <div className="pcab-linkcard-u">Свои клиенты по ссылке — комиссия ниже</div>
          </div>
          <button type="button" className="pcab-copy-btn" onClick={copyLink}>
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
      </div>
    </div>
  );
}
