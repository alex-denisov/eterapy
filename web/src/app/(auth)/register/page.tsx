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
import { sanitizeName, sanitizeEmail, getNameError, getEmailError } from "@/lib/validation";
import { appUrl, homeUrlForRole } from "@/lib/subdomain";
import { persistGuestResultDraftToAccount } from "@/lib/guest-result-cache";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [guestResultSaved, setGuestResultSaved] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [acceptContract, setAcceptContract] = useState(false);
  const [acceptPdn, setAcceptPdn] = useState(false);
  const consentGiven = acceptContract && acceptPdn;
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const intent = searchParams.get("intent");
  const isSavingResult = intent === "save-result";

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
    if (!consentGiven) {
      toast.error("Отметьте оба согласия, чтобы зарегистрироваться");
      return;
    }
    setDuplicateEmail(false);

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, acceptContract, acceptPdn }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "DUPLICATE_EMAIL") setDuplicateEmail(true);
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
        const persisted = await persistGuestResultDraftToAccount();
        setGuestResultSaved(persisted.saved);
        setRegistered(true);
        toast.success(persisted.saved ? "Аккаунт создан, ответ сохранён." : "Аккаунт создан! Проверьте email для подтверждения.");
      }
    } catch {
      toast.error("Ошибка сети. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <main className="soft-clarity-page soft-public-page min-h-screen" data-testid="auth-v41-register-success">
        <section className="soft-shell flex min-h-[70vh] items-center justify-center px-4 py-12">
        <div className="soft-card w-full max-w-md space-y-4 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--soft-apricot)] font-heading text-2xl text-[var(--soft-bordeaux)]">✉</div>
          <h1 className="font-heading text-2xl font-medium text-[var(--soft-bordeaux)]">Почти готово!</h1>
          <p className="text-[var(--soft-ink-soft)]">
            {guestResultSaved ? "Ваш ответ сохранён в кабинете. " : ""}
            Мы отправили письмо на <strong className="text-[var(--soft-bordeaux)]">{email}</strong>.
            Перейдите по ссылке в письме чтобы подтвердить аккаунт.
          </p>
          <p className="text-sm text-[var(--soft-ink-faint)]">
            Не получили? Проверьте папку «Спам».
          </p>
          <Link href={appUrl("")} className="block text-sm font-semibold text-[var(--soft-terracotta-dark)] hover:underline">
            Перейти в кабинет →
          </Link>
        </div>
        </section>
      </main>
    );
  }

  return (
    <main className="soft-clarity-page soft-public-page min-h-screen" data-testid="auth-v41-register">
      <section className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
      <div className="flex items-center px-4 py-10 sm:px-8 lg:justify-end lg:px-16">
      <Card className="soft-card w-full max-w-[520px]">
        <CardHeader className="text-center">
          <p className="soft-eyebrow">регистрация</p>
          <CardTitle className="font-heading text-3xl font-medium leading-tight text-[var(--soft-bordeaux)]">
            Создайте личное пространство для своих вопросов.
          </CardTitle>
          <p className="text-sm text-[var(--soft-ink-soft)]">
            {isSavingResult ? "Сохраните уже полученный ответ и вернитесь к нему позже" : "Регистрация после первого полезного шага"}
          </p>
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
                className={`soft-input ${nameError ? "border-destructive" : ""}`}
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
                className={`soft-input ${emailError ? "border-destructive" : ""}`}
              />
              {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
              {duplicateEmail && (
                <div className="mt-2 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-ink-soft)]" data-testid="duplicate-email-state">
                  <p className="font-medium text-[var(--soft-bordeaux)]">Аккаунт с этим email уже есть.</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Link href={`/login?email=${encodeURIComponent(email)}${isSavingResult ? "&intent=save-result" : ""}`} className="text-[var(--soft-terracotta-dark)] hover:underline">
                      Войти
                    </Link>
                    <Link href={`/auth/forgot-password?email=${encodeURIComponent(email)}`} className="text-[var(--soft-terracotta-dark)] hover:underline">
                      Сбросить пароль
                    </Link>
                  </div>
                </div>
              )}
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
              className="soft-input"
            />
            </div>
            {/* B427 (M28): exactly two separate, non-pre-checked consent checkboxes. */}
            <label className="flex items-start gap-2 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
              <input
                type="checkbox"
                checked={acceptContract}
                onChange={(e) => setAcceptContract(e.target.checked)}
                className="mt-1 accent-[var(--soft-terracotta)]"
                data-testid="consent-contract"
              />
              <span>
                Я принимаю{" "}
                <Link href="/legal/terms" target="_blank" rel="noopener" className="underline">Пользовательское соглашение</Link>,{" "}
                <Link href="/legal/offer" target="_blank" rel="noopener" className="underline">Публичную оферту</Link>,{" "}
                <Link href="/legal/subscriptions" target="_blank" rel="noopener" className="underline">Правила подписок</Link>,{" "}
                <Link href="/legal/points" target="_blank" rel="noopener" className="underline">Правила баллов ясности</Link>,{" "}
                <Link href="/legal/sessions" target="_blank" rel="noopener" className="underline">Правила сессий со специалистами</Link>,{" "}
                <Link href="/legal/disclaimer" target="_blank" rel="noopener" className="underline">Дисклеймер</Link>{" "}
                и подтверждаю, что мне исполнилось 18 лет.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
              <input
                type="checkbox"
                checked={acceptPdn}
                onChange={(e) => setAcceptPdn(e.target.checked)}
                className="mt-1 accent-[var(--soft-terracotta)]"
                data-testid="consent-pdn"
              />
              <span>
                Я даю согласие на обработку моих персональных данных в соответствии с{" "}
                <Link href="/legal/consent" target="_blank" rel="noopener" className="underline">Согласием на обработку персональных данных</Link>{" "}
                и{" "}
                <Link href="/legal/privacy" target="_blank" rel="noopener" className="underline">Политикой обработки персональных данных</Link>.
              </span>
            </label>
            <Button type="submit" className="soft-button soft-button-primary w-full justify-center" disabled={loading || !consentGiven}>
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
          <p className="mt-4 text-center text-sm text-[var(--soft-ink-soft)]">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-[var(--soft-terracotta-dark)] hover:underline">
              Войти
            </Link>
          </p>
          <div className="mt-4">
            <div className="relative flex items-center my-3">
              <div className="flex-1 border-t border-[var(--soft-paper-edge)]" />
              <span className="mx-3 text-xs text-[var(--soft-ink-faint)]">или через</span>
              <div className="flex-1 border-t border-[var(--soft-paper-edge)]" />
            </div>
            {/*
              Google-вход скрыт из UI для RU-запуска (недоступен в РФ).
              Механика входа через Google намеренно сохранена в next-auth
              (web/src/lib/auth.ts) — здесь убрана только кнопка.
            */}
            <div className="grid gap-2">
              <VKIDButton
                disabled={!consentGiven}
                onBeforeAuth={() => {
                  // B427: mark consent so the VK callback can log it for the new account.
                  document.cookie = "vk_consent=1; path=/; max-age=900; SameSite=Lax; Secure";
                }}
              />
            </div>
            {!consentGiven && (
              <p className="mt-2 text-center text-xs text-[var(--soft-ink-faint)]">
                Отметьте оба согласия выше, чтобы продолжить.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
      <aside className="hidden items-center px-8 lg:flex" style={{ background: "linear-gradient(160deg, #F4D9C1, #E8C4B8)" }}>
        <div className="grid max-w-[420px] gap-4">
          {[
            ["Шифрование на устройстве", "Никто, кроме вас, не видит содержание разборов."],
            ["Без рекламы и продажи данных", "Вы клиент, а не товар."],
            ["Удаление за 5 секунд", "Без писем в поддержку и форм отказа."],
          ].map(([title, body]) => (
            <div key={title} className="soft-card-flat p-5">
              <p className="font-heading text-lg font-medium text-[var(--soft-bordeaux)]">{title}</p>
              <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{body}</p>
            </div>
          ))}
        </div>
      </aside>
      </section>
    </main>
  );
}
