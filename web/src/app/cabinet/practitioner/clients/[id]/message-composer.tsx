"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";

// B478 — composer одностороннего сообщения (mockup -client-messages, owner
// review #3): textarea + «Вложить» (через /api/files) + «Отправить».

export function MessageComposer({ clientId, bookingId }: { clientId: string; bookingId?: string }) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setBusy(true);
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
      toast.success("Отправлено — клиент получит уведомление");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить");
      setBusy(false);
    }
  }

  return (
    <div className="soft-card p-3.5" data-testid="practitioner-message-composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="soft-input min-h-24 w-full resize-y p-3 text-sm leading-relaxed"
        placeholder="Материал или бережное сообщение клиенту…"
        maxLength={4000}
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
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          className="soft-chip inline-flex items-center gap-1.5"
          disabled={uploading || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="size-3.5" aria-hidden="true" />}
          Вложить
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
          style={{ minHeight: "2.1rem", padding: "0.4rem 0.9rem", fontSize: "0.82rem" }}
          disabled={busy || uploading}
          onClick={send}
          data-testid="practitioner-message-send"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
          Отправить
        </button>
      </div>
    </div>
  );
}
