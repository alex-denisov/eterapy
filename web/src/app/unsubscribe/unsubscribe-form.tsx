"use client";

import { useState } from "react";

type State = "idle" | "pending" | "done" | "error";

export function UnsubscribeForm({ token }: { token: string | null }) {
  const [state, setState] = useState<State>("idle");

  if (!token) {
    return (
      <p className="text-sm text-[var(--soft-ink-soft)]">
        Ссылка неполная — в ней нет опознавательной части. Откройте её из письма
        целиком или отключите рекламные сообщения в кабинете: «Настройки» →
        «Уведомления».
      </p>
    );
  }

  if (state === "done") {
    return (
      <p className="text-sm text-[var(--soft-ink)]">
        Готово. Рекламные сообщения вам больше не уходят. Уведомления о записях,
        оплатах и сессиях это не затрагивает — они не реклама, и отключаются
        отдельно в кабинете.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-[var(--soft-ink-soft)]">
        Нажмите кнопку, чтобы отписаться. Служебные уведомления — о записях,
        оплатах и сессиях — останутся: они не реклама.
      </p>
      <button
        type="button"
        disabled={state === "pending"}
        onClick={async () => {
          setState("pending");
          try {
            const response = await fetch("/api/marketing/unsubscribe", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token }),
            });
            setState(response.ok ? "done" : "error");
          } catch {
            setState("error");
          }
        }}
        className="soft-button soft-button-primary mt-6"
      >
        {state === "pending" ? "Отписываем…" : "Отписаться"}
      </button>
      {state === "error" && (
        <p className="mt-4 text-sm text-[var(--signal-danger)]">
          Не получилось — ссылка могла устареть или быть повреждена при
          пересылке. Рекламные сообщения можно отключить в кабинете:
          «Настройки» → «Уведомления».
        </p>
      )}
    </>
  );
}
