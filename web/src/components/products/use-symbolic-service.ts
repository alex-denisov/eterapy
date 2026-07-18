"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { loginUrl } from "@/lib/subdomain";
import type { SymbolicProductKey } from "@/lib/symbolic-products";
import { miniAppLoginPath } from "@/lib/miniapp/navigation";

// B450/B451: общий клиентский хук для символических услуг на паттерне Таро/reframe.
// Один платный шаг → полный результат; нет бесплатного фрагмента (route отдаёт 402);
// сессионность по ?reading=<id> (свежий заход = новая услуга, последний результат
// НЕ подтягивается); гарантированное списание + 503 без списания, если LLM не отдал
// результат. Компонент услуги добавляет свой ввод/визуал и зовёт generate(userInput).

export type SymbolicResult = {
  id: string;
  productKey?: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: unknown;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: SymbolicResult;
  results?: SymbolicResult[];
  error?: string;
  code?: string;
  safetyLevel?: string;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((payload as ApiPayload).error ?? "Не удалось выполнить действие");
    (error as Error & { status?: number }).status = response.status;
    (error as Error & { code?: string }).code = (payload as ApiPayload).code;
    throw error;
  }
  return payload as T;
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.href = miniAppLoginPath(next) ?? `${loginUrl()}?next=${encodeURIComponent(next)}`;
}

export function readingIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("reading");
}

export function useSymbolicService(
  productKey: SymbolicProductKey,
  // Вызывается ВНУТРИ .then() восстановления по ?reading= (микротаск, не тело эффекта),
  // чтобы компонент распарсил userInput в свои поля/recap без cascading-render.
  onRestore?: (userInput: string) => void,
) {
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";

  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [result, setResult] = useState<SymbolicResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [safetyInterrupted, setSafetyInterrupted] = useState(false);
  const onRestoreRef = useRef(onRestore);
  useEffect(() => { onRestoreRef.current = onRestore; });

  // Сессионность: восстановить конкретный результат по ?reading=<id> (как у Таро).
  useEffect(() => {
    const readingId = readingIdFromUrl();
    if (!readingId) return;
    if (authStatus === "unauthenticated") {
      redirectToLogin();
      return;
    }
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setStatus("loading");
        setMessage(null);
      }
    });
    jsonRequest<ApiPayload>(`/api/products/symbolic/${readingId}?productKey=${encodeURIComponent(productKey)}`)
      .then((payload) => {
        if (cancelled || !payload.result) return;
        if (payload.result.productKey && payload.result.productKey !== productKey) {
          setMessage("Этот разбор относится к другой услуге и не может быть открыт на этой странице.");
          setStatus("error");
          return;
        }
        setResult(payload.result);
        setStatus("idle");
        const md = payload.result.metadata as { userInput?: unknown } | undefined;
        if (md && typeof md.userInput === "string") onRestoreRef.current?.(md.userInput);
      })
      .catch((error) => {
        if (cancelled) return;
        const typed = error as Error & { status?: number };
        setMessage(typed.status === 404
          ? "Этот разбор не найден или недоступен в текущем аккаунте."
          : typed.message || "Не удалось открыть сохранённый разбор.");
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [authStatus, productKey]);

  // Узнаём доступ на свежем экране (без ?reading=), чтобы показать прямой CTA.
  useEffect(() => {
    if (authStatus !== "authenticated" || readingIdFromUrl()) return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/symbolic?productKey=${productKey}`)
      .then((payload) => { if (!cancelled) setHasEntitlement(Boolean(payload.hasEntitlement)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, productKey]);

  async function generate(userInput: string) {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    setStatus("loading");
    setMessage(null);
    setSafetyInterrupted(false);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/symbolic", {
        method: "POST",
        body: JSON.stringify({ productKey, userInput }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      const next = payload.result ?? null;
      setResult(next);
      setStatus("idle");
      if (next?.id && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("reading", next.id);
        window.history.replaceState(null, "", url.toString());
      }
    } catch (error) {
      const typed = error as Error & { status?: number; code?: string };
      if (typed.status === 401) return redirectToLogin();
      if (typed.code === "SAFETY_INTERRUPTED") {
        setSafetyInterrupted(true);
        setMessage(typed.message);
      } else if (typed.status === 402) {
        setHasEntitlement(false);
        setMessage("Откройте разбор баллами или картой — результат появится здесь же.");
      } else if (typed.status === 503) {
        setMessage("Не получилось собрать разбор — попробуйте ещё раз. Баллы не списаны.");
      } else {
        setMessage(typed.message || "Не удалось собрать разбор");
      }
      setStatus("error");
    }
  }

  function reset() {
    setResult(null);
    setMessage(null);
    setStatus("idle");
    setSafetyInterrupted(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("reading");
      window.history.replaceState(null, "", url.toString());
    }
  }

  return {
    isAuthenticated,
    hasEntitlement,
    setHasEntitlement,
    result,
    status,
    message,
    safetyInterrupted,
    setMessage,
    generate,
    reset,
  };
}
