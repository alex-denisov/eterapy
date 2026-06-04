"use client";

import { useRef, useState } from "react";
import { ShieldCheck, Paperclip, X, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Attachment = { url: string; name: string };

export function VerificationRequestCard({ pendingStatus }: { pendingStatus: string | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(pendingStatus);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // X8: Russian, human status labels (no raw enum, no «уже в очереди»).
  const STATUS_LABELS: Record<string, string> = {
    PENDING: "На проверке",
    REVIEWING: "Проверяем документы",
    APPROVED: "Подтверждён",
    REJECTED: "Отклонена",
  };

  // Y5: a request is valid with a real description OR at least one document.
  const canSubmit = note.trim().length >= 20 || attachments.length > 0;

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files).slice(0, 10 - attachments.length)) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", "DOCUMENT");
        const res = await fetch("/api/files", { method: "POST", body: form });
        const data = await res.json();
        if (res.ok && data.ok && typeof data.url === "string") {
          uploaded.push({ url: data.url, name: file.name });
        } else {
          toast.error(data.error ?? `Не удалось загрузить ${file.name}`);
        }
      }
      if (uploaded.length) setAttachments((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  }

  async function submit() {
    if (!canSubmit) {
      toast.error("Опишите, что нужно подтвердить (от 20 символов), или приложите документы.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/practitioner/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, portfolio, attachments: attachments.map((a) => a.url) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Не удалось отправить запрос");
      setStatus(data.status ?? "PENDING");
      setOpen(false);
      toast.success("Запрос на верификацию отправлен");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить запрос");
    } finally {
      setBusy(false);
    }
  }

  if (status) {
    const isRejected = status === "REJECTED";
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3 text-sm text-[var(--soft-ink-soft)]">
        <ShieldCheck className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <span>
          Статус верификации: <span className="font-semibold text-[var(--soft-bordeaux)]">{STATUS_LABELS[status] ?? status}</span>.
          {status === "PENDING" || status === "REVIEWING" ? " Ответ в течение 1–2 дней." : ""}
          {isRejected ? " Можно подать повторно." : ""}
        </span>
        {isRejected && (
          <button type="button" className="soft-chip ml-auto" onClick={() => setStatus(null)}>
            Подать снова
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          className="soft-button soft-button-primary"
          style={{ minHeight: "2rem", padding: "0.4rem 0.9rem", fontSize: "0.8125rem" }}
          onClick={() => setOpen(true)}
          data-testid="practitioner-verification-open"
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Пройти верификацию
        </button>
      ) : (
        <div className="rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4">
          <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">Заявка на верификацию</p>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
            Расскажите, что подтвердить (образование, опыт), и приложите документы — диплом, сертификаты, удостоверение.
          </p>

          <label className="mt-3 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="verification-note">
            Что проверить
          </label>
          <textarea
            id="verification-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="soft-input mt-1 min-h-40 w-full resize-y p-3 text-sm leading-relaxed"
            placeholder="Например: профильное образование (психфак МГУ, 2018), 6 лет практики, сертификат КПТ. Документы — во вложении."
          />

          {/* Y5: document attachments — PDF/JPG/PNG up to 20 МБ via /api/files. */}
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="soft-button soft-button-ghost"
                style={{ minHeight: "1.85rem", padding: "0.3rem 0.7rem", fontSize: "0.78rem" }}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || attachments.length >= 10}
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="size-3.5" aria-hidden="true" />}
                Приложить документы
              </button>
              <span className="text-xs text-[var(--soft-ink-faint)]">PDF, JPG, PNG · до 20 МБ</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,text/plain"
              multiple
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files)}
            />
            {attachments.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {attachments.map((a) => (
                  <li key={a.url} className="flex items-center gap-2 rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-xs">
                    <FileText className="size-3.5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[var(--soft-ink-soft)]">{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.url)} aria-label="Удалить" className="text-[var(--soft-ink-faint)] hover:text-[var(--soft-bordeaux)]">
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="mt-3 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="verification-portfolio">
            Ссылка на портфолио или документы (необязательно)
          </label>
          <input
            id="verification-portfolio"
            value={portfolio}
            onChange={(event) => setPortfolio(event.target.value)}
            className="soft-input mt-1 h-9 w-full text-sm"
            placeholder="https://..."
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="soft-button soft-button-primary"
              style={{ minHeight: "1.95rem", padding: "0.35rem 0.85rem", fontSize: "0.8125rem" }}
              disabled={busy || uploading || !canSubmit}
              onClick={submit}
            >
              {busy ? "Отправляем…" : "Отправить на проверку"}
            </button>
            <button
              type="button"
              className="soft-button soft-button-ghost"
              style={{ minHeight: "1.95rem", padding: "0.35rem 0.85rem", fontSize: "0.8125rem" }}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Отмена
            </button>
            {!canSubmit && (
              <span className="text-xs text-[var(--soft-ink-faint)]">Заполните описание или приложите документ</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
