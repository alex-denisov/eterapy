"use client";

import { useState } from "react";
import { Copy, Link2, X } from "lucide-react";
import { toast } from "sonner";

// B466 R9-4 P3 — мобильная «Доступность» 1-в-1 по mockup
// practitioner-calendar-availability.html: рабочие часы по дням с
// тумблерами, «Цены за сессию» (тумблеры длительностей, цены read-only),
// ссылка для записи, пояснения. Те же API, что и десктопные редакторы:
// PUT /api/schedule {rules} и PATCH /api/rates {practitionerId, rates}.
// B466 R9-5 — редактор диапазона часов (approved mockup
// practitioner-calendar-availability-edit.html): «Изменить» открывает шторку
// с per-day началом/концом (шаг 30 мин), пресетами и «скопировать на будни».

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
const WEEKDAYS = [1, 2, 3, 4, 5]; // Пн..Пт

// Слоты записи идут шагом 30 мин — редактор часов держит тот же шаг.
const PICK_MIN = 6 * 60; // 06:00 — самое раннее начало
const PICK_MAX = 23 * 60; // 23:00 — самый поздний конец
const STEP = 30;

function two(n: number): string {
  return n.toString().padStart(2, "0");
}
function ruleStart(r: Rule): number {
  return r.startHour * 60 + r.startMinute;
}
function ruleEnd(r: Rule): number {
  return r.endHour * 60 + r.endMinute;
}
function minLabel(total: number): string {
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`;
}
function hoursLabel(rule: Rule): string {
  return `${minLabel(ruleStart(rule))} – ${minLabel(ruleEnd(rule))}`;
}
function timeOptions(fromMin: number, toMin: number): number[] {
  const opts: number[] = [];
  for (let t = fromMin; t <= toMin; t += STEP) opts.push(t);
  return opts;
}

interface Preset {
  label: string;
  start: number;
  end: number;
}
const PRESETS: Preset[] = [
  { label: "Будни 10–19", start: 10 * 60, end: 19 * 60 },
  { label: "Будни 9–18", start: 9 * 60, end: 18 * 60 },
];

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
  const makeRules = (): Rule[] =>
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
    );
  const [rules, setRules] = useState<Rule[]>(makeRules);
  const [rates, setRates] = useState<Rate[]>(initialRates);
  const [copied, setCopied] = useState(false);

  // ── редактор часов ──────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Rule[]>(rules);
  const [saving, setSaving] = useState(false);
  // {dayOfWeek, field} — какое время сейчас выбираем; null = список дней.
  const [picking, setPicking] = useState<{ dayOfWeek: number; field: "start" | "end" } | null>(null);

  function openEditor() {
    setDraft(rules.map((r) => ({ ...r })));
    setPicking(null);
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setPicking(null);
  }
  function setDayTime(dayOfWeek: number, field: "start" | "end", total: number) {
    setDraft((prev) =>
      prev.map((r) => {
        if (r.dayOfWeek !== dayOfWeek) return r;
        const h = Math.floor(total / 60);
        const m = total % 60;
        return field === "start"
          ? { ...r, startHour: h, startMinute: m }
          : { ...r, endHour: h, endMinute: m };
      }),
    );
  }
  function toggleDraftDay(dayOfWeek: number) {
    setDraft((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, enabled: !r.enabled } : r)));
  }
  function applyPreset(preset: Preset) {
    setDraft((prev) =>
      prev.map((r) =>
        WEEKDAYS.includes(r.dayOfWeek)
          ? {
              ...r,
              enabled: true,
              startHour: Math.floor(preset.start / 60),
              startMinute: preset.start % 60,
              endHour: Math.floor(preset.end / 60),
              endMinute: preset.end % 60,
            }
          : r,
      ),
    );
  }
  function copyMondayToWeekdays() {
    setDraft((prev) => {
      const mon = prev.find((r) => r.dayOfWeek === 1);
      if (!mon) return prev;
      return prev.map((r) =>
        WEEKDAYS.includes(r.dayOfWeek) && r.dayOfWeek !== 1
          ? { ...r, startHour: mon.startHour, startMinute: mon.startMinute, endHour: mon.endHour, endMinute: mon.endMinute }
          : r,
      );
    });
  }
  const activePreset = PRESETS.find((p) =>
    draft
      .filter((r) => WEEKDAYS.includes(r.dayOfWeek))
      .every((r) => r.enabled && ruleStart(r) === p.start && ruleEnd(r) === p.end),
  );

  async function saveSchedule() {
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: draft }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Ошибка");
      setRules(draft);
      toast.success("Рабочие часы сохранены");
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

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
  const pickingRule = picking ? draft.find((r) => r.dayOfWeek === picking.dayOfWeek) : undefined;
  const pickOptions =
    picking && pickingRule
      ? picking.field === "start"
        ? timeOptions(PICK_MIN, ruleEnd(pickingRule) - STEP)
        : timeOptions(ruleStart(pickingRule) + STEP, PICK_MAX)
      : [];
  const pickCurrent = picking && pickingRule ? (picking.field === "start" ? ruleStart(pickingRule) : ruleEnd(pickingRule)) : 0;

  return (
    <div data-testid="calendar-availability-mobile">
      {/* Рабочие часы */}
      <div className="pcab-section18">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Рабочие часы</span>
          <button type="button" className="pcab-section-link" onClick={openEditor} data-testid="availability-edit-open">
            Изменить
          </button>
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

      {/* ── Редактор рабочих часов (шторка) ──────────────────────────── */}
      {editorOpen && (
        <div className="pcab-sheet-wrap" data-testid="availability-editor">
          <button type="button" className="pcab-sheet-scrim" aria-label="Закрыть" onClick={closeEditor} />
          <div className="pcab-sheet" role="dialog" aria-modal="true" aria-label="Рабочие часы">
            <div className="pcab-grabber" aria-hidden="true" />

            {picking && pickingRule ? (
              <>
                <div className="pcab-sheet-head">
                  <span className="pcab-sheet-title">
                    {DAY_LABELS[picking.dayOfWeek]} · {picking.field === "start" ? "начало" : "конец"}
                  </span>
                  <button type="button" className="pcab-sheet-x" aria-label="Назад к дням" onClick={() => setPicking(null)}>
                    <X width={15} height={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className="pcab-sheet-sub">Шаг — 30 минут, как у слотов записи.</div>
                <div className="pcab-timepick" data-testid="availability-timepick">
                  {pickOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`pcab-timepick-opt${t === pickCurrent ? " sel" : ""}`}
                      onClick={() => {
                        setDayTime(picking.dayOfWeek, picking.field, t);
                        setPicking(null);
                      }}
                    >
                      {minLabel(t)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="pcab-sheet-head">
                  <span className="pcab-sheet-title">Рабочие часы</span>
                  <button type="button" className="pcab-sheet-x" aria-label="Закрыть" onClick={closeEditor}>
                    <X width={15} height={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className="pcab-sheet-sub">
                  Когда клиенты могут к вам записаться. Слоты для записи берутся только из этих интервалов.
                </div>

                <div className="pcab-presets">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={`pcab-preset-chip${activePreset?.label === preset.label ? " active" : ""}`}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <span className={`pcab-preset-chip${activePreset ? "" : " active"}`} aria-hidden="true">
                    Свои часы
                  </span>
                </div>

                <div className="pcab-elist">
                  {draft.map((rule) => (
                    <div key={rule.dayOfWeek} className={`pcab-erow${rule.enabled ? "" : " off"}`} data-testid="availability-edit-day">
                      <span className="pcab-erow-dn">{DAY_LABELS[rule.dayOfWeek]}</span>
                      {rule.enabled ? (
                        <div className="pcab-erange">
                          <button
                            type="button"
                            className="pcab-tfield"
                            onClick={() => setPicking({ dayOfWeek: rule.dayOfWeek, field: "start" })}
                          >
                            {minLabel(ruleStart(rule))}
                          </button>
                          <span className="pcab-dash">–</span>
                          <button
                            type="button"
                            className="pcab-tfield"
                            onClick={() => setPicking({ dayOfWeek: rule.dayOfWeek, field: "end" })}
                          >
                            {minLabel(ruleEnd(rule))}
                          </button>
                        </div>
                      ) : (
                        <span className="pcab-erange off">выходной</span>
                      )}
                      <button
                        type="button"
                        className={`pcab-toggle${rule.enabled ? "" : " off"}`}
                        role="switch"
                        aria-checked={rule.enabled}
                        aria-label={`${DAY_LABELS[rule.dayOfWeek]}: ${rule.enabled ? "рабочий" : "выходной"}`}
                        onClick={() => toggleDraftDay(rule.dayOfWeek)}
                      >
                        <span className="knob" />
                      </button>
                    </div>
                  ))}
                </div>

                <button type="button" className="pcab-copyline" onClick={copyMondayToWeekdays}>
                  <Copy width={14} height={14} strokeWidth={2} aria-hidden="true" />
                  Скопировать Пн на все будни
                </button>

                <button
                  type="button"
                  className="pcab-sheet-save"
                  onClick={saveSchedule}
                  disabled={saving}
                  data-testid="availability-editor-save"
                >
                  {saving ? "Сохраняем…" : "Сохранить часы"}
                </button>
                <div className="pcab-sheet-hint">Отдельные даты (отпуск, перерыв) закрываются на вкладке «Расписание».</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
