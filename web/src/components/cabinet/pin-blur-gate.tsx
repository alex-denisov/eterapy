"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import {
  DIARY_PIN_CHANGED_EVENT,
  DIARY_PIN_STORAGE_KEY,
  DIARY_PIN_UNLOCK_KEY,
  parseDiaryPinRecord,
  shouldLockDiary,
  verifyDiaryPin,
} from "@/lib/diary-pin";

// B512 R1-12 (owner 2026-07-15) — поблочная приватность Главной под PIN
// Дневника: при активном PIN содержимое приватных блоков («Ваши результаты»,
// «Ваш дневник», «Что дальше по вашей теме», «Продолжить работу со
// специалистом») заблюрено; клик по блюру открывает ввод PIN и разблокирует
// ТОЛЬКО этот блок. Свежая разблокировка Дневника (sessionStorage, 15 минут
// активности) считается доверенным устройством — блоки открыты.
//
// До маунта содержимое скрыто (opacity-0), чтобы приватный контент не мелькал
// до того, как клиентский код прочитает состояние PIN из localStorage.

type GateState = "checking" | "open" | "locked";

function readUnlockedAt(): number | null {
  try {
    const raw = sessionStorage.getItem(DIARY_PIN_UNLOCK_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function PinBlurGate({ label, children }: { label: string; children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [formOpen, setFormOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
      if (!record) {
        setState("open");
        return;
      }
      setState((current) =>
        // Уже разблокированный вручную блок не запирается обратно от событий.
        current === "open" ? "open" : shouldLockDiary(readUnlockedAt(), Date.now()) ? "locked" : "open",
      );
    };
    // Post-mount чтение client-only состояния PIN (SSR его не знает).
    sync();
    window.addEventListener(DIARY_PIN_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DIARY_PIN_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
    if (!record) {
      setState("open");
      return;
    }
    if (!(await verifyDiaryPin(pin, record))) {
      setError("Неверный PIN. Попробуйте ещё раз.");
      return;
    }
    // Разблокируем ТОЛЬКО этот блок (owner: по-блочно) — глобальную метку
    // Дневника не трогаем.
    setPin("");
    setFormOpen(false);
    setState("open");
  }

  if (state === "open") return <>{children}</>;

  return (
    <div className="relative" data-testid="pin-blur-gate" data-state={state}>
      <div
        className={state === "checking" ? "opacity-0" : "pointer-events-none select-none blur-md"}
        aria-hidden="true"
      >
        {children}
      </div>
      {state === "locked" && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-[16px]">
          {formOpen ? (
            <form
              onSubmit={unlock}
              className="flex w-full max-w-[240px] flex-col gap-2 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3 shadow-[0_18px_38px_-16px_rgba(60,40,25,.35)]"
              data-testid="pin-blur-form"
            >
              <p className="text-center text-[11.5px]" style={{ color: "var(--soft-ink-faint)" }}>{label}</p>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                placeholder="PIN"
                aria-label={`PIN для блока «${label}»`}
                className="soft-question-input text-center tracking-[0.4em]"
                autoFocus
              />
              {error && <p className="text-center text-xs text-[var(--soft-bordeaux)]" role="alert">{error}</p>}
              <button type="submit" className="soft-button soft-button-primary justify-center" style={{ minHeight: "2.25rem" }}>
                Показать
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-4 py-2 text-[13px] font-semibold shadow-[0_10px_24px_-14px_rgba(60,40,25,.4)] transition-colors hover:border-[var(--soft-terracotta)]"
              style={{ color: "var(--soft-bordeaux)" }}
              data-testid="pin-blur-unlock"
            >
              <Lock className="size-4 shrink-0" aria-hidden="true" />
              Под PIN-кодом — показать
            </button>
          )}
        </div>
      )}
    </div>
  );
}
