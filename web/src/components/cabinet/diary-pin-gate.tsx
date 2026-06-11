"use client";

// B369 (M26): опциональный device-level PIN Дневника. Видимый CTA прямо в
// разделе, включение за 30 секунд. PIN хранится только на этом устройстве
// (localStorage, соль + SHA-256), запрашивается после 15 минут неактивности
// или перезапуска браузера. Не заменяет пароль аккаунта.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import {
  DIARY_PIN_STORAGE_KEY,
  DIARY_PIN_UNLOCK_KEY,
  hashDiaryPin,
  isValidDiaryPin,
  parseDiaryPinRecord,
  serializeDiaryPinRecord,
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
  const [showSetup, setShowSetup] = useState(false);
  const [pin, setPin] = useState("");
  const [pinRepeat, setPinRepeat] = useState("");
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

  const savePin = useCallback(async () => {
    setError(null);
    if (!isValidDiaryPin(pin)) {
      setError("PIN — от 4 до 6 цифр.");
      return;
    }
    if (pin !== pinRepeat) {
      setError("PIN не совпадает. Введите одинаковый код дважды.");
      return;
    }
    localStorage.setItem(DIARY_PIN_STORAGE_KEY, serializeDiaryPinRecord(await hashDiaryPin(pin)));
    sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()));
    setPin("");
    setPinRepeat("");
    setShowSetup(false);
    setState("unlocked");
  }, [pin, pinRepeat]);

  const disablePin = useCallback(() => {
    localStorage.removeItem(DIARY_PIN_STORAGE_KEY);
    sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY);
    setState("no-pin");
  }, []);

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

  return (
    <>
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        {state === "no-pin" && !showSetup && (
          <button
            type="button"
            onClick={() => setShowSetup(true)}
            className="soft-chip inline-flex items-center gap-2"
            data-testid="diary-pin-enable-cta"
          >
            <Lock className="size-3.5" aria-hidden="true" />
            Закрыть дневник PIN-кодом
          </button>
        )}
        {state === "no-pin" && showSetup && (
          <div className="soft-card-flat max-w-md p-5" data-testid="diary-pin-setup">
            <p className="inline-flex items-center gap-2 font-semibold text-[var(--soft-bordeaux)]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              PIN для этого устройства
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{MICROCOPY}</p>
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => { event.preventDefault(); void savePin(); }}
            >
              <input
                type="password" inputMode="numeric" autoComplete="off" maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                placeholder="PIN (4–6 цифр)"
                aria-label="Новый PIN"
                className="soft-question-input"
                data-testid="diary-pin-new"
              />
              <input
                type="password" inputMode="numeric" autoComplete="off" maxLength={6}
                value={pinRepeat}
                onChange={(event) => setPinRepeat(event.target.value.replace(/\D/g, ""))}
                placeholder="Ещё раз"
                aria-label="Повтор PIN"
                className="soft-question-input"
                data-testid="diary-pin-repeat"
              />
              {error && <p className="text-sm text-[var(--soft-bordeaux)]" role="alert">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className="soft-button soft-button-primary" data-testid="diary-pin-save">
                  Включить PIN
                </button>
                <button
                  type="button"
                  className="soft-button soft-button-ghost"
                  onClick={() => { setShowSetup(false); setError(null); setPin(""); setPinRepeat(""); }}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        )}
        {state === "unlocked" && (
          <button
            type="button"
            onClick={disablePin}
            className="soft-chip inline-flex items-center gap-2"
            data-testid="diary-pin-disable"
            title={MICROCOPY}
          >
            <LockOpen className="size-3.5" aria-hidden="true" />
            PIN включён · отключить
          </button>
        )}
      </div>
      {children}
    </>
  );
}
