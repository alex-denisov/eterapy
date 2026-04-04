"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { sessionCounter } from "@/lib/session-counter";

/**
 * Проверяет авторизацию и лимит сессий перед запуском инструмента.
 * Возвращает { canRun, increment } — вызови increment() перед запуском.
 */
export function useToolAuth() {
  const { data: session } = useSession();
  const router = useRouter();

  function check(): boolean {
    if (!session) {
      toast("Нужна регистрация", {
        description: "Зарегистрируйтесь — это бесплатно, займёт 30 секунд.",
        action: { label: "Зарегистрироваться", onClick: () => router.push("/register") },
        duration: 5000,
      });
      return false;
    }

    if (!sessionCounter.increment()) {
      toast.error("Лимит исчерпан", {
        description: "Вы использовали все 3 бесплатных сессии этого месяца.",
        duration: 6000,
      });
      return false;
    }

    return true;
  }

  return { check, isLoggedIn: !!session };
}

/** Компонент-заглушка когда лимит исчерпан */
export function LimitExceededBlock() {
  return (
    <div className="mt-8 rounded-xl border border-primary/20 bg-card/30 p-8 text-center">
      <p className="text-4xl">🔒</p>
      <h3 className="mt-4 font-heading text-xl font-semibold">Лимит сессий исчерпан</h3>
      <p className="mt-2 text-muted-foreground">
        Вы использовали все 3 бесплатных сессии этого месяца.
      </p>

      <div className="mt-6 rounded-xl border border-border/40 bg-card/20 p-4 text-left">
        <p className="mb-3 text-sm font-medium text-foreground">Тарифы:</p>
        <div className="space-y-2">
          {[
            { name: "Стартовый", sessions: 10, price: 299 },
            { name: "Стандартный", sessions: 30, price: 699, popular: true },
            { name: "Безлимитный", sessions: "∞", price: 1299 },
          ].map((t) => (
            <div key={t.name} className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${t.popular ? "border-primary/40 bg-primary/5" : "border-border/30"}`}>
              <div>
                <span className="text-sm font-medium">{t.name}</span>
                {t.popular && <span className="ml-2 text-xs text-primary">Популярный</span>}
                <p className="text-xs text-muted-foreground">{t.sessions} сессий/мес</p>
              </div>
              <span className="text-sm font-semibold text-primary">{t.price} ₽</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Link href="/dashboard/billing" className={cn(buttonVariants())}>
          Выбрать тариф
        </Link>
        <p className="text-xs text-muted-foreground">
          Лимит также обновляется 1-го числа каждого месяца
        </p>
      </div>
    </div>
  );
}

/** Блок "нужна регистрация" */
export function AuthRequiredBlock({ toolName }: { toolName: string }) {
  return (
    <div className="mt-8 rounded-xl border border-primary/20 bg-card/30 p-8 text-center">
      <p className="text-4xl">🔐</p>
      <h3 className="mt-4 font-heading text-xl font-semibold">Нужна регистрация</h3>
      <p className="mt-2 text-muted-foreground">
        Чтобы использовать «{toolName}», создайте бесплатный аккаунт.
        Это займёт 30 секунд — карта не нужна.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Link href="/register" className={cn(buttonVariants())}>
          Зарегистрироваться бесплатно
        </Link>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Уже есть аккаунт? Войти
        </Link>
      </div>
    </div>
  );
}
