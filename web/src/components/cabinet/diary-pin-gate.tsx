"use client";

// B369 (M26): опциональный device-level PIN Дневника. Видимый CTA прямо в
// разделе, включение за 30 секунд. PIN хранится только на этом устройстве
// (localStorage, соль + SHA-256), запрашивается после 15 минут неактивности
// или перезапуска браузера. Не заменяет пароль аккаунта.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import {
  DIARY_PIN_STORAGE_KEY,
  DIARY_PIN_UNLOCK_KEY,
  parseDiaryPinRecord,
  shouldLockDiary,
  verifyDiaryPin,
} from "@/lib/diary-pin";

const MICROCOPY =
  "PIN нужен только для входа в Дневник. Он не заменяет пароль аккаунта и не запрашивается в письмах или чате.";

type GateState = "loading" | "no-pin" | "locked" | "unlocked";

function readUnlockedAt(): number | null {
  const raw = sessionStorage.getItem(DIARY_PIN_UNLOCK_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function DiaryPinGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const touchRef = useRef(0);

  useEffect(() => {
    // localStorage есть только на клиенте — начальное состояние можно
    // вычислить лишь после маунта (иначе hydration mismatch).
    const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
    if (!record) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("no-pin");
      return;
    }
    setState(shouldLockDiary(readUnlockedAt(), Date.now()) ? "locked" : "unlocked");
  }, []);

  // Пока разблокировано — продлеваем метку активности (раз в ~30 секунд).
  useEffect(() => {
    if (state !== "unlocked") return;
    const touch = () => {
      const now = Date.now();
      if (now - touchRef.current < 30_000) return;
      touchRef.current = now;
      sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(now));
    };
    touch();
    window.addEventListener("click", touch);
    window.addEventListener("keydown", touch);
    window.addEventListener("scroll", touch, { passive: true });
    return () => {
      window.removeEventListener("click", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("scroll", touch);
    };
  }, [state]);

  const unlock = useCallback(async () => {
    setError(null);
    const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
    if (!record) {
      setState("no-pin");
      return;
    }
    if (!(await verifyDiaryPin(pin, record))) {
      setError("Неверный PIN. Попробуйте ещё раз.");
      return;
    }
    sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()));
    setPin("");
    setState("unlocked");
  }, [pin]);

  if (state === "loading") {
    return <div className="p-6 md:p-8" data-testid="diary-pin-loading" aria-busy="true" />;
  }

  if (state === "locked") {
    return (
      <div className="grid min-h-[24rem] place-items-center p-6 md:p-8" data-testid="diary-pin-lock">
        <div className="soft-card w-full max-w-sm p-7 text-center">
          <Lock className="mx-auto size-7 text-[var(--soft-bordeaux)]" aria-hidden="true" />
          <h2 className="soft-h3 mt-3">Дневник закрыт PIN-кодом</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{MICROCOPY}</p>
          <form
            className="mt-5 flex flex-col gap-3"
            onSubmit={(event) => { event.preventDefault(); void unlock(); }}
          >
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              placeholder="PIN"
              aria-label="PIN Дневника"
              className="soft-question-input text-center tracking-[0.4em]"
              data-testid="diary-pin-input"
              autoFocus
            />
            {error && <p className="text-sm text-[var(--soft-bordeaux)]" role="alert">{error}</p>}
            <button type="submit" className="soft-button soft-button-primary justify-center" data-testid="diary-pin-submit">
              Открыть дневник
            </button>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            Забыли PIN? Он хранится только на этом устройстве: очистите данные сайта в браузере —
            записи Дневника при этом не пострадают, они в вашем аккаунте.
          </p>
        </div>
      </div>
    );
  }

  // B464 round-4 #9: the gate now ONLY guards (loading / locked / children).
  // Setting, changing and disabling the PIN live in the single
  // DiaryPinControl modal in the page header — no more duplicated toggles.
  return <>{children}</>;
}
