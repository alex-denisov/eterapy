"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { toast } from "sonner";
import { appUrl, mainUrl } from "@/lib/subdomain";

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
                <Link href={appUrl("/cabinet/billing")}>
                  <Button className="w-full" variant="default">
                    Пополнить на {deficitRub} ₽
                  </Button>
                </Link>
              ) : (
                <Link href={mainUrl("/register")}>
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
                  className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground"
                >
                  <svg className="h-4 w-4 fill-[#0077FF]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13.162 18.994c.609 0 .858-.406.851-1.008-.03-1.765 1.01-2.701 1.01-2.701s1.378 1.945 2.047 2.843c.465.628.863.866 1.5.866h2.462c.756 0 .997-.343.747-.961-.267-.617-.963-1.61-1.882-2.619-1.18-1.367-1.208-1.425-.34-2.717.851-1.263 2.395-3.398 2.395-3.398.465-.718.24-1.148-.628-1.148h-2.462c-.703 0-.992.375-1.214.849-1.02 2.013-2.85 4.099-3.548 3.638-.673-.43-.518-2.19-.518-2.19 0-2.252.643-3.198-.624-3.5-1.113-.252-1.977-.27-3.092-.027-1.42.317-1.5 1.196-.84 1.298.852.14 1.126.69 1.183 1.637.153 2.44-.464 3.47-1.174 3.068-1.06-.607-2.297-3.003-3.25-5.407-.253-.646-.583-.857-1.255-.857H2.69c-.756 0-.998.408-.748 1.001 2.302 5.45 5.012 8.742 9.213 8.742l1.007-.01z"/>
                  </svg>
                  VK
                </button>
                {/* Google */}
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: window.location.href })}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground"
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
                className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground"
              >
                <svg className="h-4 w-4 fill-[#0077FF]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.162 18.994c.609 0 .858-.406.851-1.008-.03-1.765 1.01-2.701 1.01-2.701s1.378 1.945 2.047 2.843c.465.628.863.866 1.5.866h2.462c.756 0 .997-.343.747-.961-.267-.617-.963-1.61-1.882-2.619-1.18-1.367-1.208-1.425-.34-2.717.851-1.263 2.395-3.398 2.395-3.398.465-.718.24-1.148-.628-1.148h-2.462c-.703 0-.992.375-1.214.849-1.02 2.013-2.85 4.099-3.548 3.638-.673-.43-.518-2.19-.518-2.19 0-2.252.643-3.198-.624-3.5-1.113-.252-1.977-.27-3.092-.027-1.42.317-1.5 1.196-.84 1.298.852.14 1.126.69 1.183 1.637.153 2.44-.464 3.47-1.174 3.068-1.06-.607-2.297-3.003-3.25-5.407-.253-.646-.583-.857-1.255-.857H2.69c-.756 0-.998.408-.748 1.001 2.302 5.45 5.012 8.742 9.213 8.742l1.007-.01z"/>
                </svg>
                VK
              </button>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: window.location.href })}
                className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground"
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
