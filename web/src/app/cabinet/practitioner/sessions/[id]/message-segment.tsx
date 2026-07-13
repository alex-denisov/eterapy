"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, Wand2, X } from "lucide-react";
import { toast } from "sonner";

// B478 — сегмент «Сообщение» AI-ассистента (mockup -session-client-message,
// owner-фиксы): тон-чипы ПЕРЕПИСЫВАЮТ черновик через AI; действия =
// «Приложить» + «Отправить клиенту» (без «Копировать»); доставка — клиент
// получит в разделе «Сообщения». Односторонний канал.

const TONES = [
  { key: "warm", label: "Тёплый" },
  { key: "neutral", label: "Нейтральный" },
  { key: "brief", label: "Коротко" },
] as const;

export function MessageSegment({
  clientId,
  clientLabel,
  bookingId,
  initialDraft,
  variant = "desktop",
}: {
  clientId: string;
  clientLabel: string;
  bookingId: string;
  initialDraft: string;
  variant?: "desktop" | "pcab";
}) {
  const [text, setText] = useState(initialDraft);
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function rewrite(tone: string) {
    if (text.trim().length < 2) {
      toast.error("Черновик пуст");
      return;
    }
    setRewriting(tone);
    try {
      const res = await fetch("/api/practitioner/messages/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.text !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Не удалось переписать");
      }
      setText(data.text);
      toast.success("Черновик переписан");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось переписать");
    } finally {
      setRewriting(null);
    }
  }

  async function uploadFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "DOCUMENT");
      const res = await fetch("/api/files", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok || typeof data.url !== "string") {
        throw new Error(data.error ?? "Не удалось загрузить файл");
      }
      setAttachment({ url: data.url, name: file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function send() {
    if (text.trim().length < 2) {
      toast.error("Напишите сообщение");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/practitioner/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          bookingId,
          text,
          attachmentUrl: attachment?.url,
          attachmentName: attachment?.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось отправить");
      setSent(true);
      toast.success("Отправлено клиенту");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  // ── МОБАЙЛ (mockup -session-client-message, pcab-native) ──────────────────
  if (variant === "pcab") {
    if (sent) {
      return (
        <div className="pcab-msg-sent" data-testid="session-message-sent-mobile">
          <p className="pcab-msg-sent-t">Сообщение отправлено</p>
          <p className="pcab-msg-sent-s">
            {clientLabel} получит уведомление и прочитает его в разделе «Сообщения». История — в карточке клиента.
          </p>
        </div>
      );
    }
    return (
      <div data-testid="session-segment-message-mobile">
        <p className="pcab-msg-cap">
          Черновик после сессии — отправится только после вашей проверки. Канал односторонний.
        </p>
        <div className="pcab-msg-tonerow" data-testid="session-message-tones-mobile">
          <span className="pcab-msg-tonelabel">Тон (перепишет через AI):</span>
          {TONES.map((tone) => (
            <button
              key={tone.key}
              type="button"
              className="pcab-svc-chip"
              disabled={rewriting !== null || sending}
              onClick={() => rewrite(tone.key)}
            >
              {rewriting === tone.key ? <Loader2 width={12} height={12} className="animate-spin" aria-hidden="true" /> : <Wand2 width={12} height={12} aria-hidden="true" />}
              {tone.label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="pcab-msg-ta"
          maxLength={4000}
          placeholder="Бережное сообщение клиенту по итогам сессии…"
          data-testid="session-message-draft-mobile"
        />
        {attachment && (
          <div className="pcab-msg-attach">
            <Paperclip width={13} height={13} aria-hidden="true" />
            <span className="pcab-msg-attach-name">{attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)} aria-label="Убрать вложение">
              <X width={13} height={13} aria-hidden="true" />
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,text/plain" className="hidden" onChange={(e) => uploadFile(e.target.files)} />
        <div className="pcab-msg-actions">
          <button type="button" className="pcab-abtn pcab-abtn-ghost" disabled={uploading || sending} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 width={16} height={16} className="animate-spin" aria-hidden="true" /> : <Paperclip width={16} height={16} aria-hidden="true" />}
            Приложить
          </button>
          <button type="button" className="pcab-abtn pcab-abtn-primary" disabled={sending || uploading} onClick={send} data-testid="session-message-send-mobile">
            {sending ? <Loader2 width={16} height={16} className="animate-spin" aria-hidden="true" /> : <Send width={16} height={16} aria-hidden="true" />}
            Отправить клиенту
          </button>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <section className="soft-card mt-5 p-5 text-center" data-testid="session-message-sent">
        <p className="soft-h3" style={{ color: "var(--soft-bordeaux)" }}>Сообщение отправлено</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          {clientLabel} получит уведомление и прочитает его в разделе «Сообщения» своего кабинета. История — в
          карточке клиента.
        </p>
      </section>
    );
  }

  return (
    <section className="soft-card mt-5 p-4 sm:p-5" data-testid="session-segment-message">
      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        Черновик после сессии — отправится только после вашей проверки. Канал односторонний: клиент прочитает и
        вернётся к теме на следующей сессии.
      </p>

      {/* Tone chips — rewrite via AI (real mechanic) */}
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="session-message-tones">
        <span className="text-xs text-[var(--soft-ink-faint)]">Тон (перепишет черновик через AI):</span>
        {TONES.map((tone) => (
          <button
            key={tone.key}
            type="button"
            className="soft-chip inline-flex items-center gap-1"
            disabled={rewriting !== null || sending}
            onClick={() => rewrite(tone.key)}
          >
            {rewriting === tone.key ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <Wand2 className="size-3" aria-hidden="true" />}
            {tone.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="soft-input mt-3 min-h-40 w-full resize-y p-3 text-sm leading-relaxed"
        maxLength={4000}
        placeholder="Бережное сообщение клиенту по итогам сессии…"
        data-testid="session-message-draft"
      />

      {attachment && (
        <p className="mt-2 flex items-center gap-2 rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--soft-terracotta-dark)]" />
          <span className="min-w-0 flex-1 truncate text-[var(--soft-ink-soft)]">{attachment.name}</span>
          <button type="button" onClick={() => setAttachment(null)} aria-label="Убрать вложение" className="text-[var(--soft-ink-faint)] hover:text-[var(--soft-bordeaux)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" className="soft-chip inline-flex items-center gap-1.5" disabled={uploading || sending} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="size-3.5" aria-hidden="true" />}
          Приложить
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,text/plain"
          className="hidden"
          onChange={(e) => uploadFile(e.target.files)}
        />
        <button
          type="button"
          className="soft-button soft-button-primary"
          disabled={sending || uploading}
          onClick={send}
          data-testid="session-message-send"
        >
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
          Отправить клиенту
        </button>
      </div>
      <p className="mt-2 text-right text-[11px] text-[var(--soft-ink-faint)]">клиент получит в разделе «Сообщения»</p>
    </section>
  );
}
