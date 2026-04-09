"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

// П.6 — неделя с понедельника
const DAYS = [
  { dow: 1, label: "Понедельник" },
  { dow: 2, label: "Вторник" },
  { dow: 3, label: "Среда" },
  { dow: 4, label: "Четверг" },
  { dow: 5, label: "Пятница" },
  { dow: 6, label: "Суббота" },
  { dow: 0, label: "Воскресенье" },
];
// Порядок соответствует DOW_ORDER в WeekCalendar

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface Rule {
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  enabled: boolean;
}

interface Props {
  initialRules: Rule[];
  onSaved?: () => void;
}

export function ScheduleSettings({ initialRules, onSaved }: Props) {
  const [rules, setRules] = useState<Rule[]>(() =>
    DAYS.map(d => {
      const found = initialRules.find(r => r.dayOfWeek === d.dow);
      return found ?? { dayOfWeek: d.dow, startHour: 10, startMinute: 0, endHour: 20, endMinute: 0, enabled: false };
    })
  );
  const [saving, setSaving] = useState(false);

  function updateRule(dow: number, patch: Partial<Rule>) {
    setRules(prev => prev.map(r => r.dayOfWeek === dow ? { ...r, ...patch } : r));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("Расписание сохранено"); onSaved?.(); }
      else toast.error(d.error ?? "Ошибка");
    } catch { toast.error("Ошибка сети"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      {DAYS.map(({ dow, label }) => {
        const rule = rules.find(r => r.dayOfWeek === dow)!;
        return (
          <div key={dow} className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
            rule.enabled ? "border-primary/20 bg-card/40" : "border-border/20 bg-card/10 opacity-60"
          }`}>
            <div className="flex items-center gap-3 w-36 shrink-0">
              <ToggleSwitch
                enabled={rule.enabled}
                onToggle={() => updateRule(dow, { enabled: !rule.enabled })}
                label={`${label} — ${rule.enabled ? "включено" : "выключено"}`}
              />
              <span className="text-sm font-medium">{label}</span>
            </div>

            {rule.enabled && (
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <span className="text-xs text-muted-foreground">с</span>
                <select value={rule.startHour}
                  onChange={e => updateRule(dow, { startHour: Number(e.target.value) })}
                  className="rounded border border-border/30 bg-background/50 px-2 py-1 text-sm focus:border-primary focus:outline-none">
                  {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
                <span className="text-xs text-muted-foreground">до</span>
                <select value={rule.endHour}
                  onChange={e => updateRule(dow, { endHour: Number(e.target.value) })}
                  className="rounded border border-border/30 bg-background/50 px-2 py-1 text-sm focus:border-primary focus:outline-none">
                  {HOURS.filter(h => h > rule.startHour).map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
                <span className="ml-2 text-xs text-muted-foreground/60">
                  {rule.endHour - rule.startHour} ч
                </span>
              </div>
            )}
            {!rule.enabled && <span className="text-xs text-muted-foreground">Выходной</span>}
          </div>
        );
      })}

      <button onClick={handleSave} disabled={saving}
        className="mt-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-navy disabled:opacity-50">
        {saving ? "Сохранение..." : "Сохранить расписание"}
      </button>
    </div>
  );
}
