"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BacklinkStepStatus } from "@/lib/seo/backlink-targets";

export interface BacklinkRow {
  id: string;
  title: string;
  url: string;
  route: "api" | "session" | "human";
  humanStep: string | null;
  status: BacklinkStepStatus;
  note: string | null;
  updatedAt: string | null;
}

const STATUS_LABEL: Record<BacklinkStepStatus, string> = {
  pending: "ждёт",
  done: "сделано",
  skipped: "отклонено",
};

const STATUS_TONE: Record<BacklinkStepStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  skipped: "border-slate-200 bg-slate-50 text-slate-600",
};

/**
 * B746 — состояние шагов человека по внешним площадкам.
 *
 * Оркестратор просит регистрации по понедельникам и читает это состояние
 * перед тем, как просить: «сделано» перестаёт просить, «отклонено» не
 * повторяется. Автоматические маршруты показаны справочно — там шага
 * человека нет.
 */
export function BacklinkStatusPanel({ rows }: { rows: BacklinkRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function update(id: string, status: BacklinkStepStatus) {
    setBusy(id);
    try {
      const response = await fetch("/api/admin/marketing/backlinks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) {
        toast.error("Не удалось сохранить состояние площадки");
        return;
      }
      toast.success(`${STATUS_LABEL[status]}: оркестратор увидит это в следующем отчёте`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-2 md:grid-cols-2" data-testid="backlink-status-panel">
      {rows.map((row) => (
        <div key={row.id} className={`rounded-lg border px-3 py-3 ${STATUS_TONE[row.status]}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{row.title}</p>
              <a className="text-xs underline opacity-80" href={row.url} target="_blank" rel="noreferrer">{row.url}</a>
            </div>
            <span className="text-[0.64rem] font-bold uppercase tracking-wide">
              {row.route === "human" ? STATUS_LABEL[row.status] : "автоматически"}
            </span>
          </div>
          {row.humanStep ? <p className="mt-1 text-xs opacity-80">Шаг: {row.humanStep}</p> : null}
          {row.updatedAt ? (
            <p className="mt-1 text-[0.7rem] opacity-70">
              отмечено {new Date(row.updatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short" })}
            </p>
          ) : null}
          {row.route === "human" ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {(["done", "skipped", "pending"] as const).filter((status) => status !== row.status).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy === row.id || pending}
                  onClick={() => update(row.id, status)}
                  className="rounded border border-current/30 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide hover:bg-white/60 disabled:opacity-50"
                >
                  {status === "done" ? "сделано" : status === "skipped" ? "отклонить" : "вернуть в ожидание"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
