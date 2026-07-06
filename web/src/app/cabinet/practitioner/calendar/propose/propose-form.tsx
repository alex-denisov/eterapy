"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

// B480 — форма «Записать»: клиент · дата/время (МСК) · длительность (цена из
// тарифной сетки, read-only) · комментарий → предложение клиенту.

interface Props {
  clients: Array<{ id: string; label: string }>;
  rates: Array<{ durationMin: number; priceRub: number }>;
  preselectedClientId: string | null;
}

export function ProposeForm({ clients, rates, preselectedClientId }: Props) {
  const [clientId, setClientId] = useState(
    preselectedClientId && clients.some((c) => c.id === preselectedClientId) ? preselectedClientId : clients[0]?.id ?? "",
  );
  const [when, setWhen] = useState("");
  const [durationMin, setDurationMin] = useState(rates[0]?.durationMin ?? 50);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const price = rates.find((r) => r.durationMin === durationMin)?.priceRub ?? 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const startAt = new Date(when);
    if (!when || Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) {
      toast.error("Выберите время в будущем");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/practitioner/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, startAt: startAt.toISOString(), durationMin, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось отправить предложение");
      toast.success("Предложение отправлено клиенту");
      window.location.href = "/cabinet/practitioner/calendar";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить предложение");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4" data-testid="practitioner-propose-form">
      <section className="soft-card p-4 sm:p-5">
        <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="propose-client">
          Клиент
        </label>
        <select
          id="propose-client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="soft-input mt-1 h-11 w-full text-base"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <label className="mt-4 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="propose-when">
          Дата и время (МСК)
        </label>
        <input
          id="propose-when"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="soft-input mt-1 h-11 w-full text-base"
          required
        />

        <p className="mt-4 text-xs font-semibold text-[var(--soft-bordeaux)]">Длительность и цена</p>
        <div className="mt-1.5 flex flex-wrap gap-2" data-testid="practitioner-propose-durations">
          {rates.map((rate) => (
            <button
              key={rate.durationMin}
              type="button"
              onClick={() => setDurationMin(rate.durationMin)}
              className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                durationMin === rate.durationMin
                  ? "soft-select-pill border-transparent font-medium"
                  : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-soft)]"
              }`}
            >
              {rate.durationMin} мин · {rate.priceRub.toLocaleString("ru")} ₽
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
          Цена закреплена за длительностью (меняется в «Доступности» только вкл/выкл).
        </p>

        <label className="mt-4 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="propose-message">
          Комментарий клиенту (необязательно)
        </label>
        <textarea
          id="propose-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="soft-input mt-1 min-h-20 w-full resize-y p-3 text-sm leading-relaxed"
          placeholder="Например: продолжим работу с темой прошлой сессии"
        />
      </section>

      <button type="submit" className="soft-button soft-button-primary w-full justify-center sm:w-fit" disabled={busy || !clientId}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        Отправить предложение · {price.toLocaleString("ru")} ₽
      </button>
    </form>
  );
}
