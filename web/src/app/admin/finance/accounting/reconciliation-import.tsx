"use client";

import { useState } from "react";
import { toast } from "sonner";

type Kind = "bank" | "robokassa";

export function ReconciliationImport() {
  const [files, setFiles] = useState<Partial<Record<Kind, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Kind, { total: number; matched?: number; unmatched?: number; rows: Array<Record<string, unknown>> }>>>({});
  const [busy, setBusy] = useState<Kind | null>(null);

  async function submit(kind: Kind, confirmed: boolean) {
    const file = files[kind];
    if (!file) return toast.error("Выберите CSV-файл");
    setBusy(kind);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("type", kind);
      form.set("confirmed", String(confirmed));
      const response = await fetch("/api/admin/finance/reconciliation/import", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Импорт не удался");
      if (!confirmed) {
        setPreviews((current) => ({ ...current, [kind]: data }));
        toast.success(`Распознано строк: ${data.total}`);
      } else {
        toast.success(`Импортировано: ${data.imported}; пропущено: ${data.duplicates ?? data.unmatched ?? 0}`);
        setPreviews((current) => ({ ...current, [kind]: undefined }));
        setFiles((current) => ({ ...current, [kind]: undefined }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Импорт не удался");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {([
        ["bank", "Выписка банка", "Приходы импортируются как «не в базе УСН», расходы — как «прочее»: сначала проверьте предпросмотр."],
        ["robokassa", "Выгрузка чеков Robokassa", "Сопоставление по InvId; исходный статус и номер чека сохраняются без догадок."],
      ] as const).map(([kind, title, description]) => {
        const preview = previews[kind];
        return (
          <div key={kind} className="rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4">
            <h3 className="font-semibold text-[var(--soft-ink-strong)]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{description}</p>
            <input
              className="mt-3 block w-full text-xs"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setFiles((current) => ({ ...current, [kind]: file }));
                setPreviews((current) => ({ ...current, [kind]: undefined }));
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="soft-admin-action" type="button" disabled={busy === kind || !files[kind]} onClick={() => void submit(kind, false)}>
                Предпросмотр
              </button>
              {preview ? (
                <button className="soft-admin-action" data-variant="primary" type="button" disabled={busy === kind} onClick={() => void submit(kind, true)}>
                  Подтвердить {preview.total} строк
                </button>
              ) : null}
            </div>
            {preview ? (
              <div className="mt-3 rounded-lg bg-[var(--soft-paper-deep)] p-3 text-xs">
                <p>Распознано: {preview.total}{preview.matched !== undefined ? ` · совпало: ${preview.matched} · без пары: ${preview.unmatched}` : ""}</p>
                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-[10px] text-[var(--soft-ink-soft)]">
                  {JSON.stringify(preview.rows.slice(0, 5), null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
