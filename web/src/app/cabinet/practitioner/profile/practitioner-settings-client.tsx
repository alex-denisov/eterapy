"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { appUrl, logoutUrl } from "@/lib/subdomain";
import { RU_TIMEZONES } from "@/lib/timezones";

// B347 / Интерфейс 14 → B466 R9-5: аккаунт-настройки практика (mockup
// practitioner-desktop-settings-v2): суб-табы Аккаунт · Уведомления · Интерфейс
// · Удаление. Публичный профиль вынесен на /practitioner/profile. Смена пароля —
// в модалке с подтверждением текущего. Имя/email/язык/пояс — read-only (нет бэка
// для их изменения); NotificationSettings несёт реальную матрицу + Telegram.
type Tab = "account" | "notifications" | "interface" | "danger";

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "account", label: "Аккаунт" },
  { id: "notifications", label: "Уведомления" },
  { id: "interface", label: "Интерфейс" },
  { id: "danger", label: "Удаление" },
];

export function PractitionerSettingsClient({
  name,
  email,
  telegramStatus,
  hasPassword,
  timezone: initialTimezone,
  initialTab = "account",
}: {
  name: string;
  email: string;
  telegramStatus: TelegramStatus;
  hasPassword: boolean;
  timezone: string;
  /** B466 owner-fix #4: стартовый суб-таб из ?tab= (колокольчик →
      «Настроить уведомления» открывает сразу блок «Уведомления»). */
  initialTab?: Tab;
}) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [savingTz, setSavingTz] = useState(false);

  async function saveTimezone(next: string) {
    const prev = timezone;
    setTimezone(next);
    setSavingTz(true);
    try {
      const res = await fetch("/api/notifications/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: next }),
      });
      if (!res.ok) throw new Error();
      toast.success("Часовой пояс сохранён");
    } catch {
      toast.error("Не удалось сохранить часовой пояс");
      setTimezone(prev);
    } finally {
      setSavingTz(false);
    }
  }
  const [pwdModalOpen, setPwdModalOpen] = useState(false);

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
      if (d.ok) {
        toast.success("Пароль изменён");
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
        setPwdModalOpen(false);
      } else toast.error(d.error || "Ошибка");
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
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-settings-page">
      <div className="soft-eyebrow">Аккаунт</div>
      <h1 className="soft-h1 mt-2 mb-2">Настройки</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
        Данные входа, уведомления и интерфейс. Публичный профиль редактируется в разделе{" "}
        <Link href={appUrl("/practitioner/profile")} className="text-[var(--soft-terracotta-dark)] underline-offset-2 hover:underline">
          «Профиль»
        </Link>.
      </p>

      {/* Суб-табы (как в Финансах) */}
      <div className="mb-6 flex flex-wrap gap-1.5" style={{ borderBottom: "1px solid var(--soft-paper-edge)", paddingBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
              activeTab === t.id ? "soft-chip-warm font-medium" : "soft-chip"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Аккаунт — имя/email (read-only) + пароль (модалка) */}
      {activeTab === "account" && (
        <div className="soft-card p-6" data-testid="practitioner-settings-account">
          <h2 className="soft-h3 mb-5">Данные аккаунта</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Имя</label>
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/40 px-3 py-2.5 text-[14px] text-[var(--soft-ink-soft)]">
                <span className="truncate">{name}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--soft-ink-faint)]"><Lock size={12} /> нельзя изменить</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Email</label>
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/40 px-3 py-2.5 text-[14px] text-[var(--soft-ink-soft)]">
                <span className="truncate">{email}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}>подтверждён</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Пароль</label>
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--soft-paper-edge)] bg-white px-3 py-2">
                <span className="tracking-widest text-[var(--soft-ink-faint)]">••••••••••</span>
                {hasPassword ? (
                  <button type="button" onClick={() => setPwdModalOpen(true)} className="soft-button soft-button-ghost" style={{ minHeight: "2rem", padding: "0.35rem 0.85rem", fontSize: "0.8rem" }} data-testid="practitioner-change-password">
                    Сменить пароль
                  </button>
                ) : (
                  <span className="text-xs text-[var(--soft-ink-faint)]">вход через внешний сервис</span>
                )}
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            Имя и email привязаны к аккаунту и не меняются здесь. Пароль меняется в отдельном окне с подтверждением текущего пароля.
          </p>
        </div>
      )}

      {/* Уведомления — матрица событие × Email/Telegram/В приложении + Telegram */}
      {activeTab === "notifications" && (
        <NotificationSettings telegramStatus={telegramStatus} role="PRACTITIONER" />
      )}

      {/* Интерфейс — язык + часовой пояс (display-only: нет бэка для смены) */}
      {activeTab === "interface" && (
        <div className="soft-card p-6" data-testid="practitioner-settings-interface">
          <h2 className="soft-h3 mb-5">Интерфейс</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Язык интерфейса</label>
              <div className="rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/40 px-3 py-2.5 text-[14px] text-[var(--soft-ink-soft)]">Русский</div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Часовой пояс</label>
              <select
                value={timezone}
                onChange={(e) => saveTimezone(e.target.value)}
                disabled={savingTz}
                className="w-full rounded-[10px] border border-[var(--soft-paper-edge)] bg-white px-3 py-2.5 text-[14px] disabled:opacity-60"
                data-testid="practitioner-timezone-select"
              >
                {RU_TIMEZONES.every((t) => t.value !== timezone) && <option value={timezone}>{timezone}</option>}
                {RU_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            Часовой пояс определяет время сессий, напоминаний и «Тихих часов». Язык интерфейса — пока только русский.
          </p>
        </div>
      )}

      {/* Удаление — экспорт + деактивация */}
      {activeTab === "danger" && (
        <div className="soft-card-flat p-6" style={{ border: "1px solid rgba(176,32,32,.15)" }} data-testid="practitioner-settings-danger">
          <h2 className="soft-h3 mb-3" style={{ color: "#b02020" }}>Удаление аккаунта</h2>
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
          <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
            Аккаунт будет скрыт из каталога. Для восстановления или полного удаления данных напишите на{" "}
            <a href="mailto:support@eterapy.com" className="text-primary hover:underline">support@eterapy.com</a>.
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-[var(--soft-ink-soft)]">
                Введите ваш email ({email}) для подтверждения
              </label>
              <Input value={deleteConfirm} onChange={e => { setDeleteConfirm(e.target.value); setDeleteConfirmError(null); }}
                placeholder={email} className={`max-w-xs border-destructive/30 bg-[rgba(255,255,255,0.035)] ${deleteConfirmError ? "border-destructive" : ""}`} />
              {deleteConfirmError && <p className="mt-1 text-xs text-destructive">{deleteConfirmError}</p>}
            </div>
            <button type="button" disabled={deleting} onClick={handleDeactivate} className="soft-button" style={{ background: "#b02020", color: "#fff" }}>
              {deleting ? "Деактивация..." : "Деактивировать аккаунт"}
            </button>
          </div>
        </div>
      )}

      {/* Модалка смены пароля */}
      <Dialog open={pwdModalOpen} onOpenChange={setPwdModalOpen}>
        <DialogContent className="max-w-sm" data-testid="practitioner-password-modal">
          <DialogHeader>
            <DialogTitle>Смена пароля</DialogTitle>
            <DialogDescription>Введите текущий пароль для подтверждения, затем новый.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePassword} className="space-y-3">
            <Input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} autoComplete="current-password" placeholder="Текущий пароль" />
            <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" placeholder="Новый пароль" />
            <Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} autoComplete="new-password" placeholder="Повторите новый пароль" />
            <DialogFooter>
              <button type="button" onClick={() => setPwdModalOpen(false)} className="soft-button soft-button-ghost" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                Отмена
              </button>
              <button type="submit" disabled={savingPwd || !currentPwd || !newPwd} className="soft-button soft-button-primary" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                {savingPwd ? "Сохранение…" : "Изменить пароль"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
