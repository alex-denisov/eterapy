"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Slot {
  id: string;
  startAt: Date | string;
  endAt: Date | string;
  available: boolean;
}

export function SlotManagerFull({
  practitionerId,
  initialSlots,
}: {
  practitionerId: string;
  initialSlots: Slot[];
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);

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
        setSlots((prev) => [...prev, data.slot].sort((a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        ));
        toast.success(`Слот добавлен: ${startAt.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`);
        setDate("");
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); }
  }

  async function handleDelete(slotId: string) {
    try {
      const res = await fetch(`/api/slots/${slotId}`, { method: "DELETE" });
      if (res.ok) {
        setSlots((prev) => prev.filter((s) => s.id !== slotId));
        toast.success("Слот удалён");
      } else {
        const data = await res.json();
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
  }

  const now = new Date();
  const upcoming = slots.filter((s) => new Date(s.startAt) >= now);
  const past = slots.filter((s) => new Date(s.startAt) < now);

  return (
    <div className="space-y-6">
      {/* Форма добавления */}
      <Card className="border-border/40 bg-card/30">
        <CardContent className="p-5">
          <h3 className="font-semibold mb-4">Добавить слот</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Дата *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Начало *</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Длительность</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                <option value={30}>30 мин</option>
                <option value={45}>45 мин</option>
                <option value={60}>1 час</option>
                <option value={90}>1.5 часа</option>
                <option value={120}>2 часа</option>
              </select>
            </div>
            <Button onClick={handleAdd} disabled={loading || !date}>
              {loading ? "Добавление..." : "+ Добавить"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/60">
            Добавленные слоты появятся на вашем профиле в каталоге — клиенты смогут записаться в выбранное время.
          </p>
        </CardContent>
      </Card>

      {/* Предстоящие слоты */}
      <div>
        <h3 className="font-semibold mb-3">
          Свободные слоты
          <span className="ml-2 text-sm font-normal text-muted-foreground">({upcoming.filter(s => s.available).length})</span>
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет предстоящих слотов. Добавьте время выше.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((s) => (
              <div key={s.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                s.available ? "border-border/40 bg-card/30" : "border-yellow-500/20 bg-yellow-500/5"
              }`}>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(s.startAt).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(s.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {!s.available && (
                    <span className="text-xs text-yellow-400 border border-yellow-500/30 rounded px-2 py-0.5">Занят</span>
                  )}
                </div>
                {s.available && (
                  <button onClick={() => handleDelete(s.id)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Прошедшие */}
      {past.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-muted-foreground text-sm">Прошедшие слоты</h3>
          <div className="space-y-1.5">
            {past.slice(-5).reverse().map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-card/10 px-4 py-2 opacity-60">
                <p className="text-xs text-muted-foreground">
                  {new Date(s.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}{" "}
                  {new Date(s.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {!s.available && <span className="text-xs text-yellow-400/60">Занят</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
