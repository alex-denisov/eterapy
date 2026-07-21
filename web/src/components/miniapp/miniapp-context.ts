"use client";

/**
 * Контекст мини-аппа БЕЗ разметки и без CSS-модуля.
 *
 * Вынесен из `miniapp-shell.tsx` намеренно: общие компоненты (кнопки покупки)
 * рендерятся и в вебе, и в мини-аппе, и им нужен только доступ к данным. Импорт
 * самого шелла тянет за собой `miniapp-v21.module.css`, который jest разобрать
 * не может — тест соседнего продукта падал на `SyntaxError: Unexpected token '.'`.
 * Тот же принцип, что и в client-safe-split: точка входа не должна тащить за
 * собой всё окружение.
 */
import { createContext, useContext } from "react";
import type { MiniAppInitialData, MiniAppService } from "@/lib/miniapp/types";

export type Utility = "balance" | "subscription" | "help" | null;

export type MiniAppContextValue = {
  data: MiniAppInitialData;
  viewerName: string;
  openService: (service: MiniAppService) => void;
  openUtility: (utility: Exclude<Utility, null>) => void;
  notify: (message: string) => void;
  share: (title: string, url: string) => Promise<void>;
};

export const MiniAppV21Context = createContext<MiniAppContextValue | null>(null);

export function useMiniAppV21(): MiniAppContextValue {
  const context = useContext(MiniAppV21Context);
  if (!context) throw new Error("useMiniAppV21 must be used inside MiniAppShell");
  return context;
}

/**
 * То же, но БЕЗ требования быть внутри мини-аппа: в вебе контекста нет, и
 * обычный `useMiniAppV21` там бросил бы исключение.
 */
export function useMiniAppV21Optional(): MiniAppContextValue | null {
  return useContext(MiniAppV21Context);
}
