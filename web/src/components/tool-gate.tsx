"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { sessionCounter } from "@/lib/session-counter";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

interface ToolGateProps {
  onStart: () => Promise<void>;
  children: React.ReactNode;
  /** Показывать счётчик сессий */
  showCounter?: boolean;
}

/**
 * Обёртка над инструментом:
 * - Проверяет лимит 3 сессии/месяц перед запуском
 * - Показывает счётчик оставшихся сессий
 * - При исчерпании — показывает paywall с регистрацией
 */
export function ToolGate({ onStart, children, showCounter = true }: ToolGateProps) {
  // Инициализируем null чтобы избежать hydration mismatch:
  // localStorage недоступен при SSR, читаем только в useEffect.
  const [remaining, setRemaining] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const r = sessionCounter.getRemaining();
    setRemaining(r);
    setBlocked(r === 0);
  }, []);

  const handleStart = useCallback(async () => {
    const ok = sessionCounter.increment();
    if (!ok) {
      setBlocked(true);
      toast.error("Лимит сессий исчерпан. Зарегистрируйтесь для продолжения.");
      return;
    }
    setRemaining(sessionCounter.getRemaining());
    await onStart();
  }, [onStart]);

  if (blocked) {
    return (
      <div className="mt-8 rounded-xl border border-primary/20 bg-card/30 p-8 text-center">
        <p className="text-4xl">🔒</p>
        <h3 className="mt-4 font-heading text-xl font-semibold">Лимит сессий исчерпан</h3>
        <p className="mt-2 text-muted-foreground">
          Вы использовали все 3 бесплатных сессии этого месяца.
          Создайте аккаунт — и мы пришлём напоминание когда лимит обновится.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link href="/register" className={cn(buttonVariants())}>
            Создать бесплатный аккаунт
          </Link>
          <p className="text-xs text-muted-foreground">
            Лимит обновляется каждый месяц · Без привязки карты
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showCounter && remaining !== null && remaining < sessionCounter.limit && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border/30 bg-card/20 px-4 py-2.5 text-sm text-muted-foreground">
          <span>Осталось сессий в этом месяце:</span>
          <span className={cn(
            "font-semibold",
            remaining === 0 ? "text-destructive" : remaining === 1 ? "text-yellow-400" : "text-primary"
          )}>
            {remaining} / {sessionCounter.limit}
          </span>
          <Link href="/register" className="ml-auto text-xs text-primary hover:underline">
            Получить больше →
          </Link>
        </div>
      )}
      {/* Прокидываем handleStart через контекст */}
      <ToolGateContext.Provider value={{ handleStart }}>
        {children}
      </ToolGateContext.Provider>
    </div>
  );
}

import { createContext, useContext } from "react";
const ToolGateContext = createContext<{ handleStart: () => Promise<void> }>({
  handleStart: async () => {},
});
export const useToolGate = () => useContext(ToolGateContext);
