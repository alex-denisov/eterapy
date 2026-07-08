"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
  const nextPath = getSafeRedirectPath(searchParams.get("next"));
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
    if (accountState === "blocked" || accountState === "deleted") {
      if (status === "authenticated") {
        signOut({ redirect: false });
      }
      return;
    }

    let cancelled = false;
    if (status === "authenticated") {
      window.location.replace(nextPath ?? homeUrlForRole(session?.user?.role));
      return;
    }
    // Fallback: always check session via fetch — works even when useSession is stale
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.user?.id) {
          const role = data.user.role;
          const dest = nextPath ?? homeUrlForRole(role);
          // Only redirect if we're still on login/register page
          if (window.location.pathname === "/login" || window.location.pathname === "/register") {
            window.location.replace(dest);
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [nextPath, session?.user?.role, status, accountState]); // run once plus status change

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
    await doLogin(email, password, nextPath ?? homePathForRole("CLIENT"));
  }

  return (
    <main className="soft-clarity-page soft-public-page min-h-screen" data-testid="auth-v41-login">
      <section className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <div className="flex items-start px-4 pt-5 pb-10 sm:items-center sm:px-8 sm:py-10 lg:justify-end lg:px-16">
          <div className="w-full max-w-[520px] space-y-3 sm:space-y-4">
            {/* R9-3: on mobile the back control matches the services back-arrow
                (round icon-only, see products/[slug] product-hero-back); the
                labelled chip stays on md+. */}
            <Link
              href="/"
              aria-label="На главную"
              data-testid="login-back-mobile"
              className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)] md:hidden"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
            <Link href="/" className="soft-chip hidden md:inline-flex">← На главную</Link>
            <div className="soft-card p-6 sm:p-8">
              <div className="mb-5 sm:mb-6">
                <p className="soft-eyebrow">войти</p>
                <h1 className="soft-h1 mt-2">
                  С возвращением.<br />
                  <span className="soft-italic">Ваша карта</span> ждёт.
                </h1>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                  {isSavingResult ? "Войдите, чтобы сохранить полученный ответ в кабинет" : "Продолжите работу в своём кабинете"}
                </p>
              </div>

              {/*
                Вход через Telegram и Google скрыт из UI для RU-запуска:
                Telegram-вход не реализован и недоступен в РФ; Google-вход недоступен в РФ.
                Механика Google-входа намеренно сохранена в next-auth (web/src/lib/auth.ts)
                на случай повторного включения — здесь убрана только кнопка.
                «Забыли пароль?» доступно ссылкой внутри формы ниже.
              */}
              <div className="mb-5 grid gap-2">
                <VKIDButton />
              </div>

              <div className="relative mb-5 flex items-center">
                <div className="flex-1" style={{ borderTop: "1px solid var(--soft-paper-edge)" }} />
                <span className="mx-3 text-xs" style={{ color: "var(--soft-ink-faint)" }}>или по почте</span>
                <div className="flex-1" style={{ borderTop: "1px solid var(--soft-paper-edge)" }} />
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
                    placeholder="email@example.com"
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
                    placeholder="пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="soft-input"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <label className="flex items-center gap-2" style={{ color: "var(--soft-ink-soft)" }}>
                    <input type="checkbox" defaultChecked className="accent-[var(--soft-terracotta)]" />
                    Запомнить устройство
                  </label>
                  <Link href="/auth/forgot-password" className="font-medium" style={{ color: "var(--soft-terracotta-dark)" }}>
                    Забыли пароль?
                  </Link>
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

              <div className="mt-4 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                Нет аккаунта?{" "}
                <Link href="/register" className="font-medium" style={{ color: "var(--soft-bordeaux)" }}>
                  Создать
                </Link>
              </div>
              <p className="mt-6 text-xs leading-relaxed" style={{ color: "var(--soft-ink-faint)" }}>
                Продолжая, вы принимаете <Link href="/legal/offer" className="underline">условия</Link> и{" "}
                <Link href="/legal/privacy" className="underline">политику приватности</Link>. Мы не показываем рекламу и не передаём данные третьим лицам.
              </p>
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
        </div>
        <aside className="hidden items-center px-8 lg:flex" style={{ background: "linear-gradient(160deg, #DBD3EA, #F4D9C1)" }}>
          <div className="soft-card max-w-[420px] p-8">
            <p className="soft-eyebrow">из дневника</p>
            <p className="mt-4 font-heading text-2xl italic leading-relaxed text-[var(--soft-bordeaux)]">
              «Я приходила сюда раз в неделю в течение трёх месяцев. Не чтобы получить ответы, а чтобы научиться слышать свои.»
            </p>
            <p className="mt-4 text-xs text-[var(--soft-ink-faint)]">анонимно · по согласию</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function getSafeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
