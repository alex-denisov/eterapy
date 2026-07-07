"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

// B480 — блок «Специалист предложил время» в клиентских «Записях»: клиент
// подтверждает (создаётся бронь + оплата) или отклоняет.

interface Proposal {
  id: string;
  startAt: string;
  durationMin: number;
  priceRub: number;
  message: string | null;
  practitioner: { id: string; name: string };
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

export function BookingsProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/proposals")
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .catch(() => {});
  }, []);

  async function accept(p: Proposal) {
    setBusy(`accept:${p.id}`);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practitionerId: p.practitioner.id, proposalId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось подтвердить");
      if (typeof data.confirmationUrl === "string" && data.confirmationUrl) {
        window.location.assign(data.confirmationUrl);
        return;
      }
      toast.success("Запись создана");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось подтвердить");
      setBusy(null);
    }
  }

  async function decline(p: Proposal) {
    setBusy(`decline:${p.id}`);
    try {
      const res = await fetch(`/api/proposals/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline" }),
      });
      if (!res.ok) throw new Error("Не удалось отклонить");
      setProposals((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Предложение отклонено");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отклонить");
    } finally {
      setBusy(null);
    }
  }

  if (proposals.length === 0) return null;

  return (
    <section className="mb-6 space-y-3" data-testid="bookings-proposals">
      {proposals.map((p) => (
        <div key={p.id} className="soft-card p-4 sm:p-5" style={{ borderLeft: "3px solid var(--soft-terracotta)" }}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: "#F6E7DD", color: "var(--soft-terracotta-dark)" }}>
              <CalendarClock className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{p.practitioner.name} предлагает время сессии</p>
              <p className="mt-0.5 text-sm text-[var(--soft-ink-soft)]">
                {fmtWhen(p.startAt)} · {p.durationMin} мин · {p.priceRub.toLocaleString("ru")} ₽
              </p>
              {p.message && <p className="mt-1.5 text-xs text-[var(--soft-ink-faint)]">«{p.message}»</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="soft-button soft-button-primary"
              style={{ minHeight: "2.1rem", padding: "0.4rem 0.9rem", fontSize: "0.82rem" }}
              disabled={busy !== null}
              onClick={() => accept(p)}
              data-testid="proposal-accept"
            >
              {busy === `accept:${p.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Подтвердить и оплатить
            </button>
            <button
              type="button"
              className="soft-button soft-button-ghost"
              style={{ minHeight: "2.1rem", padding: "0.4rem 0.9rem", fontSize: "0.82rem" }}
              disabled={busy !== null}
              onClick={() => decline(p)}
            >
              Не подходит
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
