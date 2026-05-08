"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SlotManager({ practitionerId }: { practitionerId: string }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(0);

  async function handleAdd() {
    if (!date || !time) { toast.error("Укажите дату и время"); return; }

    const startAt = new Date(`${date}T${time}:00`);
    const endAt = new Date(startAt.getTime() + duration * 60 * 1000);

    setLoading(true);
    try {
      const res = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      });
      const data = await res.json();
      if (data.slot) {
        setAdded((n) => n + 1);
        toast.success(`Слот добавлен: ${startAt.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-border/40 bg-[rgba(255,255,255,0.015)] p-4">
      <h3 className="mb-3 font-medium">Добавить слот</h3>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">Дата</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">Время</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">Длительность</label>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
            className="rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none">
            <option value={30}>30 мин</option>
            <option value={45}>45 мин</option>
            <option value={60}>1 час</option>
            <option value={90}>1.5 часа</option>
          </select>
        </div>
        <Button onClick={handleAdd} disabled={loading} size="sm">
          {loading ? "..." : "+ Добавить"}
        </Button>
      </div>
      {added > 0 && <p className="mt-2 text-xs text-green-400">Добавлено слотов: {added}</p>}
    </div>
  );
}
