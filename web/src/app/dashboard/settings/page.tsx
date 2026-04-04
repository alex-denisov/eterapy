"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  // @ts-expect-error custom
  const role = session?.user?.role ?? "CLIENT";

  // Имя и фамилия из полного имени
  const fullName = session?.user?.name ?? "";
  const parts = fullName.split(" ");
  const [firstName, setFirstName] = useState(parts[0] ?? "");
  const [lastName, setLastName] = useState(parts.slice(1).join(" ") ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingName, setLoadingName] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);

  if (!session) { router.push("/login"); return null; }

  const backHref = role === "PRACTITIONER" ? "/dashboard/practitioner"
    : role === "ADMIN" ? "/admin"
    : "/dashboard";

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    if (!name) { toast.error("Введите имя"); return; }
    setLoadingName(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.ok) { await update({ name: data.name }); toast.success("Имя обновлено"); }
      else toast.error(data.error);
    } catch { toast.error("Ошибка сети"); }
    finally { setLoadingName(false); }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("Пароли не совпадают"); return; }
    setLoadingPass(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Пароль изменён");
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      } else toast.error(data.error);
    } catch { toast.error("Ошибка сети"); }
    finally { setLoadingPass(false); }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Навигация */}
      <div className="mb-6 flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={backHref} className="hover:text-foreground">← Кабинет</Link>
          <span>/</span>
          <span className="text-foreground">Настройки</span>
        </nav>
        <button onClick={() => signOut({ callbackUrl: "/" })}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Выйти
        </button>
      </div>

      <h1 className="font-heading text-2xl font-bold mb-8">Настройки и безопасность</h1>

      {/* Имя и Фамилия */}
      <Card className="mb-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Имя и фамилия</h2>
          <form onSubmit={handleNameSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                placeholder="Имя" required autoComplete="given-name" className="bg-background/50" />
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)}
                placeholder="Фамилия" autoComplete="family-name" className="bg-background/50" />
            </div>
            <Button type="submit" disabled={loadingName} size="sm">
              {loadingName ? <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Сохраняем...</span> : "Сохранить"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email */}
      <Card className="mb-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-2">Email</h2>
          <p className="text-muted-foreground text-sm mb-1">{session.user?.email}</p>
          {/* @ts-expect-error custom */}
          {session.user?.emailVerified ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-green-400">✓ Подтверждён</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400">⚠ Не подтверждён — проверьте почту</span>
          )}
          <p className="mt-2 text-xs text-muted-foreground/60">
            Для изменения email напишите в поддержку: support@eterapy.com
          </p>
        </CardContent>
      </Card>

      {/* Пароль */}
      <Card className="mb-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Сменить пароль</h2>
          <form onSubmit={handlePasswordSave} className="space-y-3">
            <Input type="password" placeholder="Текущий пароль" value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)} required
              autoComplete="current-password" className="bg-background/50" />
            <Input type="password" placeholder="Новый пароль (мин. 6 символов)" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
              autoComplete="new-password" className="bg-background/50" />
            <Input type="password" placeholder="Повторите новый пароль" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} required
              autoComplete="new-password" className="bg-background/50" />
            <Button type="submit" disabled={loadingPass} size="sm">
              {loadingPass ? <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Меняем...</span> : "Изменить пароль"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Опасная зона */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-2 text-destructive">Выход и удаление</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg border border-border/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Выйти из аккаунта
            </button>
            <button className="rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive/70 hover:text-destructive transition-colors"
              onClick={() => toast.info("Для удаления аккаунта напишите на support@eterapy.com")}>
              Удалить аккаунт
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
