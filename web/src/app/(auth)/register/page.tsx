"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Создаём аккаунт через API
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Ошибка регистрации");
        return;
      }

      // 2. Автоматически входим
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Аккаунт создан, но не удалось войти. Попробуйте войти вручную.");
      } else {
        setRegistered(true);
        toast.success("Аккаунт создан! Проверьте email для подтверждения.");
      }
    } catch {
      toast.error("Ошибка сети. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="text-5xl">📬</div>
          <h1 className="font-heading text-2xl font-bold">Почти готово!</h1>
          <p className="text-muted-foreground">
            Мы отправили письмо на <strong className="text-foreground">{email}</strong>.
            Перейдите по ссылке в письме чтобы подтвердить аккаунт.
          </p>
          <p className="text-sm text-muted-foreground">
            Не получили? Проверьте папку «Спам».
          </p>
          <Link href="/cabinet" className="block text-sm text-primary hover:underline">
            Перейти в кабинет →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/40 bg-card/50">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-2xl">Создать аккаунт</CardTitle>
          <p className="text-sm text-muted-foreground">3 бесплатных сессии в месяц</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="Ваше имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="bg-background/50"
            />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-background/50"
            />
            <Input
              type="password"
              placeholder="Пароль (мин. 6 символов)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="bg-background/50"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Создаём аккаунт...
                </span>
              ) : (
                "Зарегистрироваться"
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Войти
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground/60">
            Регистрируясь, вы соглашаетесь с{" "}
            <Link href="/legal/offer" className="hover:underline">офертой</Link>
            {" "}и{" "}
            <Link href="/legal/privacy" className="hover:underline">политикой конфиденциальности</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
