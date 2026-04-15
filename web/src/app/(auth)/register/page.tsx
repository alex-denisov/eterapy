"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VKIDButton } from "@/components/vkid-button";
import { sanitizeName, sanitizeEmail, getNameError, getEmailError } from "@/lib/validation";
import { appUrl, homePathForRole, homeUrlForRole } from "@/lib/subdomain";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const { data: session, status } = useSession();

  // Редирект, если уже залогинен
  useEffect(() => {
    if (status === "authenticated") {
      window.location.replace(homeUrlForRole(session?.user?.role));
    }
  }, [session?.user?.role, status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nErr = getNameError(name);
    setNameError(nErr);
    if (nErr) { toast.error(nErr); return; }

    const eErr = getEmailError(email);
    setEmailError(eErr);
    if (eErr) { toast.error(eErr); return; }

    setLoading(true);

    try {
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
          <Link href={appUrl("/cabinet")} className="block text-sm text-primary hover:underline">
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
            <div>
              <label htmlFor="reg-name" className="sr-only">Имя</label>
              <Input
                id="reg-name"
                type="text"
                placeholder="Ваше имя"
                value={name}
                onChange={(e) => { setName(sanitizeName(e.target.value)); setNameError(null); }}
                required
                autoComplete="name"
                className={`bg-background/50 ${nameError ? "border-destructive" : ""}`}
              />
              {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
            </div>
            <div>
              <label htmlFor="reg-email" className="sr-only">Email</label>
              <Input
                id="reg-email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => { setEmail(sanitizeEmail(e.target.value)); setEmailError(null); }}
                required
                autoComplete="email"
                className={`bg-background/50 ${emailError ? "border-destructive" : ""}`}
              />
              {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
            </div>
            <div>
              <label htmlFor="reg-password" className="sr-only">Пароль</label>
              <Input
                id="reg-password"
                type="password"
                placeholder="Пароль (мин. 8 символов)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="bg-background/50"
            />
            </div>
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
          <div className="mt-4">
            <div className="relative flex items-center my-3">
              <div className="flex-1 border-t border-border/30" />
              <span className="mx-3 text-xs text-muted-foreground">или через</span>
              <div className="flex-1 border-t border-border/30" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <VKIDButton />
              <button type="button" onClick={() => signIn("google", { callbackUrl: homePathForRole("CLIENT") })}
                className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground">
                <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </button>
            </div>
          </div>
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
