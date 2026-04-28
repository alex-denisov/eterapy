"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VKIDButton } from "@/components/vkid-button";
import { sanitizeEmail, getEmailError } from "@/lib/validation";
import { homePathForRole, homeUrlForRole } from "@/lib/subdomain";
import { persistGuestResultDraftToAccount } from "@/lib/guest-result-cache";

const TEST_ACCOUNTS = [
  { label: "Клиент", email: "client@test.eterapy.com", password: "test1234", href: "/cabinet" },
  { label: "Практик", email: "practitioner@test.eterapy.com", password: "test1234", href: "/cabinet/practitioner" },
  { label: "Админ", email: "admin@test.eterapy.com", password: "test1234", href: "/admin" },
  { label: "СуперАдмин", email: "superadmin@test.eterapy.com", password: "test1234", href: "/admin" },
  { label: "Модератор", email: "moderator@test.eterapy.com", password: "test1234", href: "/admin" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const intent = searchParams.get("intent");
  const isSavingResult = intent === "save-result";

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "CredentialsSignin") toast.error("Неверный email или пароль");
  }, [searchParams]);

  // Редирект, если уже залогинен — ОДИН РАЗ при монтировании
  useEffect(() => {
    let cancelled = false;
    if (status === "authenticated") {
      window.location.replace(homeUrlForRole(session?.user?.role));
      return;
    }
    // Fallback: always check session via fetch — works even when useSession is stale
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.user?.id) {
          const role = data.user.role;
          const dest = homeUrlForRole(role);
          // Only redirect if we're still on login/register page
          if (window.location.pathname === "/login" || window.location.pathname === "/register") {
            window.location.replace(dest);
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session?.user?.role, status]); // run once plus status change

  async function doLogin(loginEmail: string, loginPassword: string, redirectTo: string) {
    setLoading(true);
    const result = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      toast.error("Неверный email или пароль");
    } else {
      toast.success("Добро пожаловать!");
      await persistGuestResultDraftToAccount();
      // Hard navigate so server-side layout re-reads the new session cookie
      window.location.href = redirectTo;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = getEmailError(email);
    setEmailError(err);
    if (err) { toast.error(err); return; }
    await doLogin(email, password, homePathForRole("CLIENT"));
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">Вход в ETerapy</CardTitle>
            <p className="text-sm text-muted-foreground">
              {isSavingResult ? "Войдите, чтобы сохранить полученный ответ в кабинет" : "Продолжите работу в своём кабинете"}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="sr-only">Email</label>
                <Input
                  id="login-email"
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
                <label htmlFor="login-password" className="sr-only">Пароль</label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="bg-background/50"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Входим...
                  </span>
                ) : "Войти"}
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <Link href="/auth/forgot-password" className="hover:text-foreground transition-colors">
                Забыли пароль?
              </Link>
              <Link href="/register" className="text-primary hover:underline">
                Создать аккаунт
              </Link>
            </div>

            {/* OAuth — VK и Google */}
            <div className="mt-4">
              <div className="relative flex items-center my-4">
                <div className="flex-1 border-t border-border/30" />
                <span className="mx-3 text-xs text-muted-foreground">или войдите через</span>
                <div className="flex-1 border-t border-border/30" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* VK — VK ID SDK кнопка */}
                <VKIDButton />
                {/* Google */}
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: homePathForRole("CLIENT") })}
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
          </CardContent>
        </Card>

        {/* Тест-аккаунты — только в dev */}
        {process.env.NODE_ENV === "development" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="mb-3 text-xs font-medium text-primary">🧪 Тест-аккаунты (только dev)</p>
            <div className="grid grid-cols-2 gap-2">
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => doLogin(acc.email, acc.password, acc.href)}
                  disabled={loading}
                  className="rounded-lg border border-primary/30 bg-background/50 px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:opacity-50"
                >
                  <p className="font-medium text-primary">{acc.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{acc.email}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Пароль: <code className="text-primary">test1234</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
