"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { appUrl, logoutUrl } from "@/lib/subdomain";

// B347 / Интерфейс 14 → B466: аккаунт-настройки практика (mockup
// -more-settings). Публичный профиль вынесен на /practitioner/profile —
// здесь остаются Уведомления (матрица событие × Email/Telegram/В приложении +
// привязка Telegram через NotificationSettings role="PRACTITIONER"),
// Безопасность и Деактивация.
type Tab = "notifications" | "security" | "danger";

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "notifications", label: "Уведомления" },
  { id: "security", label: "Безопасность" },
  { id: "danger", label: "Удаление" },
];

export function PractitionerSettingsClient({
  email,
  telegramStatus,
  hasPassword,
}: {
  email: string;
  telegramStatus: TelegramStatus;
  hasPassword: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("notifications");

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteConfirmError, setDeleteConfirmError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error("Пароли не совпадают"); return; }
    if (newPwd.length < 8) { toast.error("Минимум 8 символов"); return; }
    setSavingPwd(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("Пароль изменён"); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); }
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setSavingPwd(false); }
  }

  async function handleDeactivate() {
    setDeleteConfirmError(null);
    if (!deleteConfirm) {
      setDeleteConfirmError("Введите email для подтверждения");
      toast.error("Введите email для подтверждения");
      return;
    }
    if (deleteConfirm !== email) {
      setDeleteConfirmError("Email введен неверно");
      toast.error("Email введен неверно");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/deactivate", { method: "POST" });
      const d = await res.json();
      if (d.ok) window.location.href = logoutUrl();
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setDeleting(false); }
  }

  return (
    <div className="px-6 py-8 md:px-8 max-w-3xl">
      <div className="soft-eyebrow">настройки практика</div>
      <h1 className="soft-h1 mt-2 mb-2">Настройки</h1>
      <p className="text-sm mb-6" style={{ color: "var(--soft-ink-soft)" }}>
        Уведомления, Telegram и безопасность аккаунта. Публичный профиль — в разделе{" "}
        <Link href={appUrl("/practitioner/profile")} className="text-[var(--soft-terracotta-dark)] underline-offset-2 hover:underline">
          «Профиль»
        </Link>.
      </p>

      {/* Табы — переключатель как в кабинете клиента */}
      <div className="flex flex-wrap gap-1.5 mb-6" style={{ borderBottom: "1px solid var(--soft-paper-edge)", paddingBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
              activeTab === t.id ? "soft-chip-warm font-medium" : "soft-chip"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Уведомления — матрица событие × Email/Telegram/В приложении + Telegram */}
      {activeTab === "notifications" && (
        <NotificationSettings telegramStatus={telegramStatus} role="PRACTITIONER" />
      )}

      {/* Безопасность */}
      {activeTab === "security" && (
        <div className="soft-card p-6">
          <h2 className="soft-h3 mb-5">Смена пароля</h2>
          {!hasPassword ? (
            <div className="rounded-xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.55)] p-4 text-sm text-[var(--soft-ink-soft)]">
              Вы вошли через внешний сервис (Google, VK, Telegram и т.д.). Смена пароля недоступна.
            </div>
          ) : (
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--soft-ink-soft)" }}>Текущий пароль</label>
                <Input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} autoComplete="current-password" />
              </div>
              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--soft-ink-soft)" }}>Новый пароль</label>
                <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--soft-ink-soft)" }}>Повторите новый пароль</label>
                <Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} autoComplete="new-password" />
              </div>
              <button type="submit" disabled={savingPwd || !currentPwd || !newPwd} className="soft-button soft-button-primary">
                {savingPwd ? "Сохранение..." : "Изменить пароль"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Деактивация */}
      {activeTab === "danger" && (
        <div className="soft-card-flat p-6" style={{ border: "1px solid rgba(176,32,32,.15)" }}>
          <h2 className="soft-h3 mb-3" style={{ color: "#b02020" }}>Деактивация аккаунта</h2>
          <div className="mb-5 rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.55)] p-4">
            <p className="text-sm font-semibold text-[var(--soft-ink)]">Экспорт личных данных</p>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
              Скачайте копию профиля, записей и уведомлений перед деактивацией.
            </p>
            <button type="button" onClick={() => { window.location.href = "/api/auth/export-data"; }}
              className="soft-button soft-button-ghost mt-3 inline-flex">
              Скачать JSON
            </button>
          </div>
          <p className="text-sm text-[var(--soft-ink-soft)] mb-4">
            Аккаунт будет скрыт из каталога. Для восстановления или полного удаления данных напишите на{" "}
            <a href="mailto:support@eterapy.com" className="text-primary hover:underline">support@eterapy.com</a>.
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-[var(--soft-ink-soft)]">
                Введите ваш email ({email}) для подтверждения
              </label>
              <Input value={deleteConfirm} onChange={e => { setDeleteConfirm(e.target.value); setDeleteConfirmError(null); }}
                placeholder={email} className={`bg-[rgba(255,255,255,0.035)] border-destructive/30 max-w-xs ${deleteConfirmError ? "border-destructive" : ""}`} />
              {deleteConfirmError && <p className="mt-1 text-xs text-destructive">{deleteConfirmError}</p>}
            </div>
            <button type="button" disabled={deleting} onClick={handleDeactivate} className="soft-button" style={{ background: "#b02020", color: "#fff" }}>
              {deleting ? "Деактивация..." : "Деактивировать аккаунт"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
