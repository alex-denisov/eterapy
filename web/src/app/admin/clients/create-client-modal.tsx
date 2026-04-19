"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [timezone, setTimezone] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [sendResetLink, setSendResetLink] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, name, birthDate, birthTime, birthPlace, timezone, telegramUsername, sendResetLink,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        toast.error(d.error ?? "Ошибка создания клиента");
        return;
      }
      toast.success(sendResetLink
        ? "Клиент создан. Отправлено письмо с ссылкой на установку пароля."
        : "Клиент создан.");
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Новый клиент</h2>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <form autoComplete="off" onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Имя *</label>
              <Input value={name} onChange={e => setName(e.target.value)} required
                className="bg-card/50 text-sm h-9" autoComplete="off" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Email *</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="bg-card/50 text-sm h-9" autoComplete="off" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Telegram (@login)</label>
              <Input value={telegramUsername} onChange={e => setTelegramUsername(e.target.value)}
                placeholder="username" className="bg-card/50 text-sm h-9" autoComplete="off" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Часовой пояс</label>
              <Input value={timezone} onChange={e => setTimezone(e.target.value)}
                placeholder="Europe/Moscow" className="bg-card/50 text-sm h-9" autoComplete="off" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Дата рождения</label>
              <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                className="bg-card/50 text-sm h-9" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Время рождения</label>
              <Input type="time" value={birthTime} onChange={e => setBirthTime(e.target.value)}
                className="bg-card/50 text-sm h-9" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-muted-foreground mb-1">Город рождения</label>
              <Input value={birthPlace} onChange={e => setBirthPlace(e.target.value)}
                placeholder="Москва" className="bg-card/50 text-sm h-9" autoComplete="off" />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={sendResetLink}
              onChange={e => setSendResetLink(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border/40 bg-card/50" />
            Отправить письмо со ссылкой на установку пароля
          </label>

          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border/40 px-4 py-2 text-xs text-muted-foreground hover:text-foreground">
              Отмена
            </button>
            <button type="submit" disabled={submitting || !name.trim() || !email.trim()}
              className="rounded-lg bg-primary/20 px-4 py-2 text-xs text-primary hover:bg-primary/30 disabled:opacity-40">
              {submitting ? "Создаём..." : "Создать клиента"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
