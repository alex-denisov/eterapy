"use client";

import { useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

export default function SettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Admins have their own settings page
  if (role === "ADMIN" || role === "SUPERADMIN") {
    router.replace("/admin/settings");
    return null;
  }
  const email = session.user?.email ?? "";
  const currentName = session.user?.name ?? "";
  const [fn, ln] = currentName.includes(" ")
    ? [currentName.split(" ")[0], currentName.split(" ").slice(1).join(" ")]
    : [currentName, ""];

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Файл слишком большой (максимум 5 МБ)"); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
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
      const data = await res.json();
      if (data.ok) {
        await update({ name });
        toast.success("Профиль обновлён");
        setAvatarFile(null);
      } else {
        toast.error(data.error || "Ошибка");
      }
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
      const data = await res.json();
      if (data.ok) {
        toast.success("Пароль изменён");
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка"); }
    finally { setSavingPwd(false); }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== email) { toast.error("Email не совпадает"); return; }
    if (role === "ADMIN") { toast.error("Аккаунт администратора не может быть удалён"); return; }

    setDeleting(true);
    try {
      const res = await fetch("/api/auth/deactivate", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        await signOut({ callbackUrl: "/" });
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка"); }
    finally { setDeleting(false); }
  }

  const displayAvatar = avatarPreview ?? (session.user?.image || null);
  const initial = currentName[0]?.toUpperCase() ?? email[0]?.toUpperCase() ?? "?";

  // ADMIN: только безопасность — нет профиля, нет удаления
  if (role === "ADMIN" || role === "SUPERADMIN") {
    return (
      <div className="px-6 py-8 max-w-2xl space-y-8">
        <h1 className="font-heading text-2xl font-bold">Настройки</h1>
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-2">Аккаунт</h2>
            <p className="text-sm text-muted-foreground mb-4">{email}</p>
            <p className="text-sm text-muted-foreground">
              Для изменения данных администратора обратитесь к суперадминистратору.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-4">Безопасность</h2>
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Текущий пароль</label>
                <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" className="bg-card/50" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Новый пароль</label>
                <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" className="bg-card/50" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Повторите</label>
                <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" className="bg-card/50" />
              </div>
              <Button type="submit" variant="outline" disabled={savingPwd || !currentPwd || !newPwd}>
                {savingPwd ? "Сохранение..." : "Изменить пароль"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-2xl space-y-8">
      <h1 className="font-heading text-2xl font-bold">Настройки</h1>

      {/* Профиль */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-5">Профиль</h2>
          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Аватар */}
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="relative group shrink-0">
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
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="text-xs text-primary hover:underline mt-0.5">
                  Загрузить фото
                </button>
                <p className="text-xs text-muted-foreground/60 mt-0.5">JPG, PNG или WebP · до 5 МБ</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Имя</label>
                <Input value={firstName || fn} onChange={(e) => setFirstName(e.target.value)} placeholder="Имя" className="bg-card/50" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Фамилия</label>
                <Input value={lastName || ln} onChange={(e) => setLastName(e.target.value)} placeholder="Фамилия" className="bg-card/50" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Email</label>
              <Input value={email} disabled className="bg-card/30 opacity-60" />
              <p className="mt-1 text-xs text-muted-foreground/60">
                Для изменения email напишите в поддержку: support@eterapy.com
              </p>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Пароль */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-5">Безопасность</h2>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Текущий пароль</label>
              <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" className="bg-card/50" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Новый пароль</label>
              <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" className="bg-card/50" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Повторите новый пароль</label>
              <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" className="bg-card/50" />
            </div>
            <Button type="submit" variant="outline" disabled={savingPwd || !currentPwd || !newPwd}>
              {savingPwd ? "Сохранение..." : "Изменить пароль"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Удаление аккаунта */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-6">
          <h2 className="font-semibold text-destructive mb-2">
            {role === "ADMIN" ? "Управление аккаунтом" : role === "PRACTITIONER" ? "Деактивация аккаунта" : "Удаление аккаунта"}
          </h2>

          {role === "ADMIN" && (
            <p className="text-sm text-muted-foreground">
              Аккаунт администратора не может быть удалён или деактивирован. Обратитесь к другому администратору.
            </p>
          )}

          {role === "PRACTITIONER" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Аккаунт практика будет деактивирован и скрыт из каталога. Данные сохраняются. Для восстановления или полного удаления напишите на <a href="mailto:support@eterapy.com" className="text-primary hover:underline">support@eterapy.com</a>.
              </p>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  Подтвердите email ({email}) для деактивации
                </label>
                <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={email} className="bg-card/50 border-destructive/30 max-w-xs" />
              </div>
              <Button variant="destructive" disabled={deleteConfirm !== email || deleting}
                onClick={handleDeleteAccount}>
                {deleting ? "Деактивация..." : "Деактивировать аккаунт"}
              </Button>
            </div>
          )}

          {role === "CLIENT" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Аккаунт будет деактивирован немедленно. Через 10 дней данные будут безвозвратно удалены. Вы можете отменить удаление, войдя в аккаунт в течение этих 10 дней.
              </p>
              <p className="text-xs text-muted-foreground/60">
                ⚠️ Удаление требует ручной верификации администратором. Если в течение 10 дней возникнут вопросы, с вами свяжутся по email.
              </p>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  Введите ваш email ({email}) для подтверждения
                </label>
                <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={email} className="bg-card/50 border-destructive/30 max-w-xs" />
              </div>
              <Button variant="destructive" disabled={deleteConfirm !== email || deleting}
                onClick={handleDeleteAccount}>
                {deleting ? "Деактивация..." : "Удалить аккаунт"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
