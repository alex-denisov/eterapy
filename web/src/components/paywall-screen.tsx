"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { toast } from "sonner";

interface PaywallScreenProps {
  balanceKopecks?: number;
  fullPriceKopecks?: number;
  /** Кнопка закрыть — возвращается на форму направления */
  onClose?: () => void;
}

export function PaywallScreen({ balanceKopecks, fullPriceKopecks, onClose }: PaywallScreenProps) {
  const isBalancePaywall = fullPriceKopecks != null && balanceKopecks != null;
  const deficitKopecks = isBalancePaywall ? fullPriceKopecks - balanceKopecks : 0;
  const deficitRub = (deficitKopecks / 100).toLocaleString("ru-RU");
  const balanceRub = ((balanceKopecks ?? 0) / 100).toLocaleString("ru-RU");
  const fullRub = fullPriceKopecks ? (fullPriceKopecks / 100).toLocaleString("ru-RU") : "299";

  const [mode, setMode] = useState<"paywall" | "login">("paywall");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      toast.error("Неверный email или пароль");
    } else {
      toast.success("Добро пожаловать!");
      window.location.reload();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => onClose?.()}>
      <div className="w-full max-w-md rounded-2xl border border-border/40 bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {mode === "paywall" ? (
          <>
            {/* Иконка */}
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <span className="text-3xl">{isBalancePaywall ? "🔮" : "✦"}</span>
            </div>

            {/* Заголовок */}
            <h2 className="text-center font-heading text-xl font-bold">
              {isBalancePaywall ? "Недостаточно средств" : "Лимит исчерпан"}
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {isBalancePaywall ? (
                <>
                  Полный расклад стоит <strong className="text-foreground">{fullRub} ₽</strong>.<br />
                  Баланс: <strong className="text-foreground">{balanceRub} ₽</strong>.<br />
                  Нужно пополнить на <strong className="text-primary">{deficitRub} ₽</strong>.
                </>
              ) : (
                <>
                  Вы использовали 3 из 3 бесплатных быстрых раскладов в этом месяце.<br />
                  Лимит обновится 1-го числа следующего месяца.
                </>
              )}
            </p>

            {/* Описание предложения */}
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-primary">
                {isBalancePaywall ? "Пополнение баланса" : "Зарегистрируйтесь на платформе"}
              </p>
              <p className="mt-1 text-center font-heading text-xl font-bold">
                {isBalancePaywall ? `${fullRub} ₽` : "Бесплатно"}
              </p>
              <ul className="mt-3 space-y-1.5 text-left text-xs text-muted-foreground">
                {isBalancePaywall ? (
                  <>
                    <li>✓ Полный расклад — 5 карт, детальный анализ</li>
                    <li>✓ 5 сфер жизни + рекомендации</li>
                    <li>✓ Результат сохраняется в истории</li>
                  </>
                ) : (
                  <>
                    <li>✓ 3 бесплатных быстрых расклада в месяц</li>
                    <li>✓ Доступ ко всем направлениям самопознания</li>
                    <li>✓ Запись к практикам по фиксированной цене</li>
                  </>
                )}
              </ul>
            </div>

            {/* Кнопки действий */}
            <div className="mt-4 flex flex-col gap-2">
              {isBalancePaywall ? (
                <Link href="/cabinet/billing">
                  <Button className="w-full" variant="default">
                    Пополнить на {deficitRub} ₽
                  </Button>
                </Link>
              ) : (
                <Link href="/register">
                  <Button className="w-full" variant="default">
                    Зарегистрироваться бесплатно
                  </Button>
                </Link>
              )}

              <div className="relative py-1 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="border-t border-border/30 w-full" />
                </div>
                <span className="relative bg-card px-3 text-xs text-muted-foreground">или войдите</span>
              </div>

              <Button variant="outline" className="w-full" onClick={() => setMode("login")}>
                Войти через email
              </Button>

              <div className="grid grid-cols-2 gap-2">
                {/* VK */}
                <button
                  type="button"
                  onClick={() => signIn("vk", { callbackUrl: window.location.href })}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/80"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14C20.67 22 22 20.67 22 15.07V8.93C22 3.33 20.67 2 15.07 2zm3.07 14.47h-1.52c-.57 0-.75-.46-1.78-1.5-0.88-.85-1.26-.97-1.48-.97-.31 0-.39.09-.39.51v1.34c0 .37-.12.6-1.12.6-1.65 0-3.49-1-4.79-2.86-1.94-2.73-2.47-4.78-2.47-5.2 0-.22.09-.42.51-.42h1.52c.38 0 .52.17.67.57.73 1.89 1.95 3.54 2.46 3.54.19 0 .27-.09.27-.57V9.36c-.05-.98-.58-1.06-.58-1.41 0-.18.15-.35.38-.35h2.38c.32 0 .43.17.43.54v2.89c0 .32.14.43.24.43.19 0 .35-.11.71-.47 1.08-1.21 1.85-3.06 1.85-3.06.1-.22.28-.42.65-.42h1.52c.45 0 .55.24.45.54-.19.87-2.06 3.54-2.06 3.54-.17.28-.23.4 0 .71.16.22.7.66 1.06 1.06.66.73 1.16 1.34 1.29 1.76.15.41-.07.63-.49.63z"/>
                  </svg>
                  VK
                </button>
                {/* Google */}
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: window.location.href })}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/80"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
              </div>

              {onClose && (
                <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={onClose}>
                  ← Назад к раскладу
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Режим логина */}
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <span className="text-3xl">✦</span>
            </div>
            <h2 className="text-center font-heading text-xl font-bold">Вход в ETerapy</h2>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Войдите чтобы продолжить использование направлений
            </p>

            <form onSubmit={handleLogin} className="mt-4 space-y-3">
              <Input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                placeholder="Пароль"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Входим..." : "Войти"}
              </Button>
            </form>

            <div className="mt-3 text-center">
              <Link href="/auth/forgot-password" className="text-xs text-primary hover:underline">
                Забыли пароль?
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => signIn("vk", { callbackUrl: window.location.href })}
                className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/80"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14C20.67 22 22 20.67 22 15.07V8.93C22 3.33 20.67 2 15.07 2zm3.07 14.47h-1.52c-.57 0-.75-.46-1.78-1.5-0.88-.85-1.26-.97-1.48-.97-.31 0-.39.09-.39.51v1.34c0 .37-.12.6-1.12.6-1.65 0-3.49-1-4.79-2.86-1.94-2.73-2.47-4.78-2.47-5.2 0-.22.09-.42.51-.42h1.52c.38 0 .52.17.67.57.73 1.89 1.95 3.54 2.46 3.54.19 0 .27-.09.27-.57V9.36c-.05-.98-.58-1.06-.58-1.41 0-.18.15-.35.38-.35h2.38c.32 0 .43.17.43.54v2.89c0 .32.14.43.24.43.19 0 .35-.11.71-.47 1.08-1.21 1.85-3.06 1.85-3.06.1-.22.28-.42.65-.42h1.52c.45 0 .55.24.45.54-.19.87-2.06 3.54-2.06 3.54-.17.28-.23.4 0 .71.16.22.7.66 1.06 1.06.66.73 1.16 1.34 1.29 1.76.15.41-.07.63-.49.63z"/>
                </svg>
                VK
              </button>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: window.location.href })}
                className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/80"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
            </div>

            <div className="mt-4 text-center">
              <Button variant="ghost" className="text-muted-foreground text-sm" onClick={() => setMode("paywall")}>
                ← Назад
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
