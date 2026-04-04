"use client";

import { useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { NotificationSettings } from "@/components/notifications/notification-settings";

type Tab = "profile" | "security" | "notifications" | "danger";

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

export function SettingsClient({ telegramStatus }: { telegramStatus: TelegramStatus }) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (status === "loading") return null;
  if (!session) { router.push("/login"); return null; }

  // @ts-expect-error custom
  const role = session.user?.role ?? "CLIENT";
  const email = session.user?.email ?? "";
  const currentName = session.user?.name ?? "";
  const [fn, ln] = currentName.includes(" ")
    ? [currentName.split(" ")[0], currentName.split(" ").slice(1).join(" ")]
    : [currentName, ""];

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Максимум 5 МБ"); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const name = `${firstName || fn} ${lastName || ln}`.trim();
    if (!name) { toast.error("Заполните имя"); return; }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      if (avatarFile) formData.append("avatar", avatarFile);
      const res = await fetch("/api/auth/update-profile", { method: "POST", body: formData });
      const d = await res.json();
      if (d.ok) { await update({ name }); toast.success("Профиль обновлён"); setAvatarFile(null); }
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setSaving(false); }
  }

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

  async function handleDeleteAccount() {
    if (deleteConfirm !== email) { toast.error("Email не совпадает"); return; }
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/deactivate", { method: "POST" });
      const d = await res.json();
      if (d.ok) await signOut({ callbackUrl: "/" });
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setDeleting(false); }
  }

  const displayAvatar = avatarPreview ?? (session.user?.image || null);
  const initial = currentName[0]?.toUpperCase() ?? "?";

  const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: "profile", label: "Профиль", icon: "👤" },
    { id: "security", label: "Безопасность", icon: "🔒" },
    { id: "notifications", label: "Уведомления", icon: "🔔" },
    ...(role !== "ADMIN" && role !== "SUPERADMIN" ? [{ id: "danger" as Tab, label: "Удаление", icon: "⚠️" }] : []),
  ];

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-6">Настройки</h1>

      {/* Табы */}
      <div className="flex gap-1 mb-6 border-b border-border/20 pb-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              activeTab === t.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Профиль */}
      {activeTab === "profile" && (
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => fileRef.current?.click()} className="relative group shrink-0">
                  <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-border/40 group-hover:border-primary/50 transition-colors">
                    {displayAvatar ? (
                      <Image src={displayAvatar} alt="Аватар" width={64} height={64} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-primary/20 flex items-center justify-center font-heading text-2xl font-bold text-primary">
                        {initial}
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
                    Изменить
                  </div>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <div>
                  <p className="text-sm font-medium">{currentName}</p>
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-primary hover:underline mt-0.5">
                    Загрузить фото
                  </button>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">JPG, PNG или WebP · до 5 МБ</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Имя</label>
                  <Input value={firstName || fn} onChange={e => setFirstName(e.target.value)} placeholder="Имя" className="bg-card/50" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">Фамилия</label>
                  <Input value={lastName || ln} onChange={e => setLastName(e.target.value)} placeholder="Фамилия" className="bg-card/50" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Email</label>
                <Input value={email} disabled className="bg-card/30 opacity-60" />
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Для изменения email напишите: support@eterapy.com
                </p>
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить профиль"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Безопасность */}
      {activeTab === "security" && (
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-5">Смена пароля</h2>
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Текущий пароль</label>
                <Input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} autoComplete="current-password" className="bg-card/50" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Новый пароль</label>
                <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" className="bg-card/50" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Повторите новый пароль</label>
                <Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} autoComplete="new-password" className="bg-card/50" />
              </div>
              <Button type="submit" variant="outline" disabled={savingPwd || !currentPwd || !newPwd}>
                {savingPwd ? "Сохранение..." : "Изменить пароль"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Уведомления */}
      {activeTab === "notifications" && (
        <NotificationSettings telegramStatus={telegramStatus} />
      )}

      {/* Удаление */}
      {activeTab === "danger" && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="p-6">
            <h2 className="font-semibold text-destructive mb-3">
              {role === "PRACTITIONER" ? "Деактивация аккаунта" : "Удаление аккаунта"}
            </h2>
            {role === "PRACTITIONER" ? (
              <p className="text-sm text-muted-foreground mb-4">
                Аккаунт будет скрыт из каталога. Для восстановления или полного удаления данных напишите на{" "}
                <a href="mailto:support@eterapy.com" className="text-primary hover:underline">support@eterapy.com</a>.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">
                Аккаунт деактивируется немедленно. Через 10 дней данные будут удалены безвозвратно.
                Вы можете отменить удаление, войдя в аккаунт в течение 10 дней.
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  Введите ваш email ({email}) для подтверждения
                </label>
                <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={email} className="bg-card/50 border-destructive/30 max-w-xs" />
              </div>
              <Button variant="destructive" disabled={deleteConfirm !== email || deleting} onClick={handleDeleteAccount}>
                {deleting ? "Деактивация..." : role === "PRACTITIONER" ? "Деактивировать аккаунт" : "Удалить аккаунт"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
