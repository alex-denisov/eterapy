"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  const [name, setName] = useState(session?.user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingName, setLoadingName] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);

  if (!session) {
    router.push("/login");
    return null;
  }

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === session!.user?.name) { toast.info("Имя не изменилось"); return; }
    setLoadingName(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.ok) {
        await update({ name: data.name });
        toast.success("Имя обновлено");
      } else {
        toast.error(data.error);
      }
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
      } else {
        toast.error(data.error);
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoadingPass(false); }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Кабинет</Link>
        {" / "}
        <span>Настройки</span>
      </nav>

      <h1 className="font-heading text-2xl font-bold mb-8">Настройки профиля</h1>

      {/* Имя */}
      <Card className="mb-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Имя</h2>
          <form onSubmit={handleNameSave} className="flex gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              required
              autoComplete="name"
              className="bg-background/50 flex-1"
            />
            <Button type="submit" disabled={loadingName}>
              {loadingName ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Сохраняем...
                </span>
              ) : "Сохранить"}
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
            <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Подтверждён
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
              Не подтверждён
            </span>
          )}
          <p className="mt-2 text-xs text-muted-foreground/60">
            Изменение email будет доступно после подключения базы данных.
          </p>
        </CardContent>
      </Card>

      {/* Пароль */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Сменить пароль</h2>
          <form onSubmit={handlePasswordSave} className="space-y-3">
            <Input
              type="password"
              placeholder="Текущий пароль"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-background/50"
            />
            <Input
              type="password"
              placeholder="Новый пароль (мин. 6 символов)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="bg-background/50"
            />
            <Input
              type="password"
              placeholder="Повторите новый пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="bg-background/50"
            />
            <Button type="submit" disabled={loadingPass}>
              {loadingPass ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Меняем...
                </span>
              ) : "Изменить пароль"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
