"use client";

// B554 п.19: кнопка-замок в Дневнике вела на страницу смены ПАРОЛЯ аккаунта —
// то есть на совсем другую сущность. В вебе (B369/B464) это device-level PIN:
// хранится только на устройстве (соль + SHA-256 в localStorage), спрашивается
// после 15 минут неактивности или перезапуска. Механики берём те же — общий
// `lib/diary-pin`, — а оболочку рисуем в стиле мини-аппа.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock, LockOpen, X } from "@phosphor-icons/react";
import {
  DIARY_PIN_CHANGED_EVENT,
  DIARY_PIN_STORAGE_KEY,
  DIARY_PIN_UNLOCK_KEY,
  hashDiaryPin,
  isValidDiaryPin,
  notifyDiaryPinChanged,
  parseDiaryPinRecord,
  serializeDiaryPinRecord,
  shouldLockDiary,
  verifyDiaryPin,
} from "@/lib/diary-pin";
import { styles } from "@/components/miniapp/styles";

const MICROCOPY = "PIN хранится только на этом устройстве и не заменяет пароль аккаунта. Мы никогда не спрашиваем его в письмах или чате.";

type GateState = "loading" | "no-pin" | "locked" | "unlocked";

function readUnlockedAt(): number | null {
  const raw = sessionStorage.getItem(DIARY_PIN_UNLOCK_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readState(): GateState {
  const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
  if (!record) return "no-pin";
  return shouldLockDiary(readUnlockedAt(), Date.now()) ? "locked" : "unlocked";
}

function PinField({ value, onChange, label, autoFocus }: { value: string; onChange: (value: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <label className={styles["diary-pin-field"]}>
      <span>{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        aria-label={label}
        autoFocus={autoFocus}
      />
    </label>
  );
}

/**
 * Замок в шапке Дневника: включить PIN, сменить, снять или закрыть Дневник
 * прямо сейчас. Открывается модальным листом, а не уводит с экрана.
 */
export function MiniAppDiaryPinButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<GateState>("loading");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const sync = useCallback(() => setState(readState()), []);

  useEffect(() => {
    // localStorage существует только на клиенте, поэтому начальное состояние
    // считается после маунта (иначе hydration mismatch) — как в вебе.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    sync();
    window.addEventListener(DIARY_PIN_CHANGED_EVENT, sync);
    return () => window.removeEventListener(DIARY_PIN_CHANGED_EVENT, sync);
  }, [sync]);

  function close() {
    setOpen(false);
    setPin(""); setConfirm(""); setCurrent(""); setMessage(null);
  }

  async function savePin() {
    setMessage(null);
    if (!isValidDiaryPin(pin)) return setMessage("PIN — от 4 до 6 цифр.");
    if (pin !== confirm) return setMessage("PIN не совпадает.");
    if (state !== "no-pin") {
      const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
      if (record && !(await verifyDiaryPin(current, record))) return setMessage("Текущий PIN неверный.");
    }
    localStorage.setItem(DIARY_PIN_STORAGE_KEY, serializeDiaryPinRecord(await hashDiaryPin(pin)));
    sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()));
    notifyDiaryPinChanged();
    close();
  }

  async function removePin() {
    setMessage(null);
    const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
    if (record && !(await verifyDiaryPin(current, record))) return setMessage("Текущий PIN неверный.");
    localStorage.removeItem(DIARY_PIN_STORAGE_KEY);
    sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY);
    notifyDiaryPinChanged();
    close();
  }

  function lockNow() {
    sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY);
    notifyDiaryPinChanged();
    close();
  }

  const hasPin = state === "locked" || state === "unlocked";

  return (
    <>
      <button
        className={styles["privacy-button"]}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={hasPin ? "PIN Дневника включён" : "Защитить Дневник PIN-кодом"}
        data-testid="miniapp-diary-pin-button"
      >
        {hasPin ? <Lock size={19} weight="fill" /> : <LockOpen size={19} />}
      </button>

      {open ? (
        <div className={styles["diary-pin-sheet"]} role="dialog" aria-modal="true" aria-label="PIN Дневника">
          <div className={styles["diary-pin-panel"]}>
            <header>
              <strong>{hasPin ? "PIN Дневника" : "Закрыть Дневник PIN-кодом"}</strong>
              <button type="button" onClick={close} aria-label="Закрыть"><X size={18} /></button>
            </header>
            <p>{MICROCOPY}</p>
            {hasPin ? <PinField value={current} onChange={setCurrent} label="Текущий PIN" autoFocus /> : null}
            <PinField value={pin} onChange={setPin} label={hasPin ? "Новый PIN" : "PIN (4–6 цифр)"} autoFocus={!hasPin} />
            <PinField value={confirm} onChange={setConfirm} label="Повторите PIN" />
            {message ? <p className={styles["form-error"]} role="alert">{message}</p> : null}
            <button className={styles["journey-primary"]} type="button" onClick={savePin}>{hasPin ? "Сменить PIN" : "Включить PIN"}</button>
            {hasPin ? <button className={styles["journey-secondary"]} type="button" onClick={lockNow}>Закрыть Дневник сейчас</button> : null}
            {hasPin ? <button className={styles["diary-pin-remove"]} type="button" onClick={removePin}>Отключить PIN</button> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Пока Дневник закрыт PIN-кодом, его содержимое не рендерим вовсе. */
export function MiniAppDiaryPinGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const touchRef = useRef(0);

  const sync = useCallback(() => setState(readState()), []);

  useEffect(() => {
    // localStorage существует только на клиенте, поэтому начальное состояние
    // считается после маунта (иначе hydration mismatch) — как в вебе.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    sync();
    window.addEventListener(DIARY_PIN_CHANGED_EVENT, sync);
    return () => window.removeEventListener(DIARY_PIN_CHANGED_EVENT, sync);
  }, [sync]);

  // Пока открыто — продлеваем метку активности, как в вебе.
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
    window.addEventListener("scroll", touch, { passive: true });
    return () => {
      window.removeEventListener("click", touch);
      window.removeEventListener("scroll", touch);
    };
  }, [state]);

  async function unlock() {
    setError(null);
    const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
    if (!record) return setState("no-pin");
    if (!(await verifyDiaryPin(pin, record))) return setError("Неверный PIN. Попробуйте ещё раз.");
    sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()));
    setPin("");
    setState("unlocked");
  }

  if (state === "loading") return <div aria-busy="true" data-testid="miniapp-diary-pin-loading" />;

  if (state === "locked") {
    return (
      <section className={styles["diary-pin-lock"]} data-testid="miniapp-diary-pin-lock">
        <Lock size={30} weight="fill" />
        <strong>Дневник закрыт PIN-кодом</strong>
        <p>{MICROCOPY}</p>
        <form onSubmit={(event) => { event.preventDefault(); void unlock(); }}>
          <PinField value={pin} onChange={setPin} label="PIN Дневника" autoFocus />
          {error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}
          <button className={styles["journey-primary"]} type="submit">Открыть Дневник</button>
        </form>
        <small>Забыли PIN? Он хранится только на этом устройстве — очистите данные приложения. Записи Дневника не пострадают, они в вашем аккаунте.</small>
      </section>
    );
  }

  return <>{children}</>;
}
