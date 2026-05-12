"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VKIDButton } from "@/components/vkid-button";
import { sanitizeEmail, getEmailError } from "@/lib/validation";
import { homePathForRole, homeUrlForRole } from "@/lib/subdomain";
import { persistGuestResultDraftToAccount } from "@/lib/guest-result-cache";

const TEST_ACCOUNTS = [
  { label: "Клиент", email: "client@test.eterapy.com", password: "test1234", href: "/cabinet" },
  { label: "Практик", email: "practitioner@test.eterapy.com", password: "test1234", href: "/cabinet/practitioner" },
  { label: "Админ", email: "admin@test.eterapy.com", password: "admin1234", href: "/admin" },
  { label: "СуперАдмин", email: "superadmin@test.eterapy.com", password: "test1234", href: "/admin" },
  { label: "Модератор", email: "moderator@test.eterapy.com", password: "admin1234", href: "/admin" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const intent = searchParams.get("intent");
  const accountState = searchParams.get("account");
  const isSavingResult = intent === "save-result";

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "CredentialsSignin") toast.error("Неверный email или пароль");
    if (err === "blocked" || accountState === "blocked") toast.error("Аккаунт заблокирован. Обратитесь в поддержку.");
    if (accountState === "deleted") toast.error("Аккаунт деактивирован или удалён.");
  }, [accountState, searchParams]);

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
    <main className="soft-clarity-page soft-public-page min-h-screen">
      <section className="soft-shell flex min-h-[70vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="soft-card" style={{ padding: "2rem" }}>
            <div className="mb-6 text-center">
              <h1 className="font-heading text-2xl font-medium" style={{ color: "var(--soft-bordeaux)" }}>
                Вход в ETerapy
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                {isSavingResult ? "Войдите, чтобы сохранить полученный ответ в кабинет" : "Продолжите работу в своём кабинете"}
              </p>
            </div>

            {(accountState === "blocked" || accountState === "deleted") && (
              <div
                className="mb-5 rounded-xl p-3 text-sm"
                style={{ background: "rgba(214,117,88,0.08)", color: "var(--soft-bordeaux)", border: "1px solid rgba(214,117,88,0.22)" }}
                data-testid="inactive-account-state"
              >
                {accountState === "blocked"
                  ? "Аккаунт заблокирован. Если это ошибка, обратитесь в поддержку ETerapy."
                  : "Аккаунт деактивирован или удалён. Для восстановления обратитесь в поддержку."}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
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
                  className={`soft-input ${emailError ? "border-destructive" : ""}`}
                />
                {emailError && <p className="mt-1 text-xs text-destructive">{emailError}</p>}
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
                  className="soft-input"
                />
              </div>
              <Button type="submit" className="soft-button soft-button-primary w-full justify-center" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Входим...
                  </span>
                ) : "Войти"}
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm">
              <Link
                href="/auth/forgot-password"
                className="transition-colors"
                style={{ color: "var(--soft-ink-soft)" }}
              >
                Забыли пароль?
              </Link>
              <Link
                href="/register"
                className="font-medium"
                style={{ color: "var(--soft-terracotta-dark)" }}
              >
                Создать аккаунт
              </Link>
            </div>

            <div className="mt-5">
              <div className="relative flex items-center my-4">
                <div className="flex-1" style={{ borderTop: "1px solid var(--soft-paper-edge)" }} />
                <span className="mx-3 text-xs" style={{ color: "var(--soft-ink-faint)" }}>или войдите через</span>
                <div className="flex-1" style={{ borderTop: "1px solid var(--soft-paper-edge)" }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <VKIDButton />
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: homePathForRole("CLIENT") })}
                  className="flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    border: "1px solid var(--soft-paper-edge)",
                    background: "var(--soft-paper-card)",
                    color: "var(--soft-ink-soft)",
                  }}
                >
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
          </div>

          {process.env.NODE_ENV === "development" && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(214,117,88,0.06)", border: "1px solid rgba(214,117,88,0.18)" }}
            >
              <p className="mb-3 text-xs font-semibold" style={{ color: "var(--soft-terracotta-dark)" }}>
                Тест-аккаунты (только dev)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TEST_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    onClick={() => doLogin(acc.email, acc.password, acc.href)}
                    disabled={loading}
                    className="rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-50"
                    style={{
                      border: "1px solid rgba(214,117,88,0.22)",
                      background: "var(--soft-paper-card)",
                      color: "var(--soft-ink)",
                    }}
                  >
                    <p className="font-medium" style={{ color: "var(--soft-bordeaux)" }}>{acc.label}</p>
                    <p className="truncate text-xs" style={{ color: "var(--soft-ink-faint)" }}>{acc.email}</p>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                Пароль: <code style={{ color: "var(--soft-terracotta-dark)" }}>test1234</code>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
