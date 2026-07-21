"use client";

// B554 п.19: кнопка-замок в Дневнике вела на страницу смены ПАРОЛЯ аккаунта —
// то есть на совсем другую сущность. В вебе (B369/B464) это device-level PIN:
// хранится только на устройстве (соль + SHA-256 в localStorage), спрашивается
// после 15 минут неактивности или перезапуска. Механики берём те же — общий
// `lib/diary-pin`, — а оболочку рисуем в стиле мини-аппа.
//
// B564 (owner 2026-07-21): установка PIN сразу закрывает Дневник, а замок ведёт
// не в форму смены, а в меню из трёх действий — разблокировать, сменить,
// отключить. Смена и отключение живут в отдельных окнах, отключение
// подтверждается текущим PIN.

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

/** Экран внутри модального листа замка. */
type SheetMode = "create" | "menu" | "unlock" | "change" | "disable";

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
 * Замок в шапке Дневника: включить PIN, разблокировать, сменить или снять.
 * Открывается модальным листом, а не уводит с экрана.
 */
export function MiniAppDiaryPinButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SheetMode>("menu");
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

  const hasPin = state === "locked" || state === "unlocked";

  function clearFields() {
    setPin(""); setConfirm(""); setCurrent(""); setMessage(null);
  }

  function close() {
    setOpen(false);
    clearFields();
  }

  function go(next: SheetMode) {
    clearFields();
    setMode(next);
  }

  function openSheet() {
    clearFields();
    setMode(hasPin ? "menu" : "create");
    setOpen(true);
  }

  /** Первая установка PIN. Владелец (B564): Дневник закрывается сразу. */
  async function createPin() {
    setMessage(null);
    if (!isValidDiaryPin(pin)) return setMessage("PIN — от 4 до 6 цифр.");
    if (pin !== confirm) return setMessage("PIN не совпадает.");
    localStorage.setItem(DIARY_PIN_STORAGE_KEY, serializeDiaryPinRecord(await hashDiaryPin(pin)));
    // Метку разблокировки НЕ ставим: без неё `shouldLockDiary` вернёт true и
    // Дневник закроется тем же действием, которым включили PIN.
    sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY);
    notifyDiaryPinChanged();
    close();
  }

  /** Смена PIN. Текущий уже подтверждён — Дневник остаётся открытым. */
  async function changePin() {
    setMessage(null);
    const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
    if (record && !(await verifyDiaryPin(current, record))) return setMessage("Текущий PIN неверный.");
    if (!isValidDiaryPin(pin)) return setMessage("PIN — от 4 до 6 цифр.");
    if (pin !== confirm) return setMessage("PIN не совпадает.");
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

  async function unlockNow() {
    setMessage(null);
    const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
    if (!record) return close();
    if (!(await verifyDiaryPin(current, record))) return setMessage("Неверный PIN. Попробуйте ещё раз.");
    sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()));
    notifyDiaryPinChanged();
    close();
  }

  function lockNow() {
    sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY);
    notifyDiaryPinChanged();
    close();
  }

  const heading = mode === "create" ? "Закрыть Дневник PIN-кодом"
    : mode === "unlock" ? "Разблокировать Дневник"
    : mode === "change" ? "Сменить PIN"
    : mode === "disable" ? "Отключить PIN"
    : "PIN Дневника";

  return (
    <>
      <button
        className={styles["privacy-button"]}
        type="button"
        onClick={openSheet}
        aria-label={hasPin ? "PIN Дневника включён" : "Защитить Дневник PIN-кодом"}
        data-testid="miniapp-diary-pin-button"
      >
        {hasPin ? <Lock size={19} weight="fill" /> : <LockOpen size={19} />}
      </button>

      {open ? (
        <div className={styles["diary-pin-sheet"]} role="dialog" aria-modal="true" aria-label="PIN Дневника">
          <div className={styles["diary-pin-panel"]} data-mode={mode} data-testid="miniapp-diary-pin-panel">
            <header>
              <strong>{heading}</strong>
              <button type="button" onClick={close} aria-label="Закрыть"><X size={18} /></button>
            </header>

            {/* Меню замка: три действия и ни одного поля ввода. Клавиатура здесь
                не открывается, поэтому лист всегда виден целиком. */}
            {mode === "menu" ? (
              <>
                <p>{MICROCOPY}</p>
                <div className={styles["diary-pin-actions"]}>
                  {state === "locked" ? (
                    <button className={styles["journey-primary"]} type="button" onClick={() => go("unlock")} data-testid="miniapp-diary-pin-unlock-action">
                      Разблокировать
                    </button>
                  ) : (
                    <button className={styles["journey-primary"]} type="button" onClick={lockNow} data-testid="miniapp-diary-pin-lock-now">
                      Закрыть Дневник сейчас
                    </button>
                  )}
                  <button className={styles["journey-secondary"]} type="button" onClick={() => go("change")} data-testid="miniapp-diary-pin-change-action">
                    Сменить PIN-код
                  </button>
                </div>
                {/* Владелец: «отключить пин-код» — отдельной строчкой. */}
                <div className={styles["diary-pin-danger-row"]}>
                  <button className={styles["diary-pin-remove"]} type="button" onClick={() => go("disable")} data-testid="miniapp-diary-pin-disable-action">
                    Отключить PIN-код
                  </button>
                </div>
              </>
            ) : null}

            {mode === "create" ? (
              <>
                <p>{MICROCOPY}</p>
                <PinField value={pin} onChange={setPin} label="PIN (4–6 цифр)" autoFocus />
                <PinField value={confirm} onChange={setConfirm} label="Повторите PIN" />
                {message ? <p className={styles["form-error"]} role="alert">{message}</p> : null}
                <button className={styles["journey-primary"]} type="button" onClick={createPin}>Включить PIN</button>
                <p className={styles["diary-pin-hint"]}>Дневник закроется сразу — откроете его этим же PIN-кодом.</p>
              </>
            ) : null}

            {mode === "unlock" ? (
              <>
                <PinField value={current} onChange={setCurrent} label="PIN Дневника" autoFocus />
                {message ? <p className={styles["form-error"]} role="alert">{message}</p> : null}
                <button className={styles["journey-primary"]} type="button" onClick={unlockNow}>Открыть Дневник</button>
                <button className={styles["journey-secondary"]} type="button" onClick={() => go("menu")}>Назад</button>
              </>
            ) : null}

            {mode === "change" ? (
              <>
                <PinField value={current} onChange={setCurrent} label="Текущий PIN" autoFocus />
                <PinField value={pin} onChange={setPin} label="Новый PIN" />
                <PinField value={confirm} onChange={setConfirm} label="Повторите новый PIN" />
                {message ? <p className={styles["form-error"]} role="alert">{message}</p> : null}
                <button className={styles["journey-primary"]} type="button" onClick={changePin}>Сохранить новый PIN</button>
                <button className={styles["journey-secondary"]} type="button" onClick={() => go("menu")}>Отмена</button>
              </>
            ) : null}

            {mode === "disable" ? (
              <>
                <p>Дневник перестанет запрашивать PIN на этом устройстве. Записи останутся на месте — они хранятся в аккаунте.</p>
                <PinField value={current} onChange={setCurrent} label="Текущий PIN" autoFocus />
                {message ? <p className={styles["form-error"]} role="alert">{message}</p> : null}
                <button className={styles["diary-pin-confirm-remove"]} type="button" onClick={removePin} data-testid="miniapp-diary-pin-disable-confirm">
                  Отключить PIN-код
                </button>
                <button className={styles["journey-secondary"]} type="button" onClick={() => go("menu")}>Отмена</button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Пока Дневник закрыт PIN-кодом, его содержимое не рендерим вовсе.
 *
 * B564 п.2: тем же фреймом закрывается список диалогов — это та же приватная
 * переписка, и оставлять её открытой при закрытом Дневнике бессмысленно.
 */
export function MiniAppDiaryPinGate({
  children,
  title = "Дневник закрыт PIN-кодом",
  action = "Открыть Дневник",
  testId = "miniapp-diary-pin-lock",
}: {
  children: ReactNode;
  title?: string;
  action?: string;
  testId?: string;
}) {
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
    // Замок в шапке и соседние экраны слушают то же событие.
    notifyDiaryPinChanged();
  }

  if (state === "loading") return <div aria-busy="true" data-testid="miniapp-diary-pin-loading" />;

  if (state === "locked") {
    return (
      <section className={styles["diary-pin-lock"]} data-testid={testId}>
        <Lock size={30} weight="fill" />
        <strong>{title}</strong>
        <p>{MICROCOPY}</p>
        <form onSubmit={(event) => { event.preventDefault(); void unlock(); }}>
          <PinField value={pin} onChange={setPin} label="PIN Дневника" autoFocus />
          {error ? <p className={styles["form-error"]} role="alert">{error}</p> : null}
          <button className={styles["journey-primary"]} type="submit">{action}</button>
        </form>
        <small>Забыли PIN? Он хранится только на этом устройстве — очистите данные приложения. Записи Дневника не пострадают, они в вашем аккаунте.</small>
      </section>
    );
  }

  return <>{children}</>;
}
