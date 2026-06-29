"use client";

import { useState } from "react";
import { BellRing, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationSettings } from "@/components/notifications/notification-settings";

export function AdminSettingsClient({
  email,
  name,
  role,
  telegramStatus,
}: {
  email: string;
  name: string;
  role: string;
  telegramStatus: { linked: boolean; username: string | null };
}) {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

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
      const data = await res.json();
      if (data.ok) {
        toast.success("Пароль изменён");
        setCurrentPwd("");
        setNewPwd("");
        setConfirmPwd("");
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[var(--soft-shadow-sm)]">
        <h2 className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">Аккаунт</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="soft-admin-data-table">
            <tbody>
              <tr><td>Имя</td><td>{name}</td></tr>
              <tr><td>Email</td><td>{email}</td></tr>
              <tr><td>Роль</td><td>{role === "SUPERADMIN" ? "Суперадминистратор" : "Администратор"}</td></tr>
              <tr><td>Доступ</td><td>{role === "SUPERADMIN" ? "Суперадминистратор" : "По назначенным правам"}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          Имя, email и полномочия администратора меняются через раздел пользователей и модераторов, чтобы все действия оставались в audit log.
        </p>
      </section>

      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-4 flex items-center gap-2">
          <LockKeyhole className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <h2 className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">Безопасность</h2>
        </div>
        <form onSubmit={handleSavePassword} className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Текущий пароль
            <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
              autoComplete="current-password" className="mt-1 h-9" name="settings-curr-pwd" data-form-type="other" />
          </label>
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Новый пароль
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password" className="mt-1 h-9" name="settings-new-pwd" data-form-type="other" />
          </label>
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Повторите
            <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password" className="mt-1 h-9" name="settings-confirm-pwd" data-form-type="other" />
          </label>
          <div className="md:col-span-3">
            <Button type="submit" disabled={savingPwd || !currentPwd || !newPwd}>
              {savingPwd ? "Сохранение..." : "Изменить пароль"}
            </Button>
          </div>
        </form>
      </section>

      {/* B6: notification management on the same admin/settings page (no
          separate route), same component as the client cabinet. */}
      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[var(--soft-shadow-sm)] lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <BellRing className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <h2 className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">Мои уведомления</h2>
        </div>
        <NotificationSettings
          telegramStatus={telegramStatus}
          role={(role === "SUPERADMIN" ? "SUPERADMIN" : "ADMIN") as "ADMIN" | "SUPERADMIN"}
        />
      </section>
    </div>
  );
}
