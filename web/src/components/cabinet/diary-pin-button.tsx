"use client";

// B464 IB2 (owner round-2 #4): the «Приватно» badge is replaced by an explicit
// control that flips «Установить PIN-код» ↔ «Отключить PIN-код». The PIN stays a
// device-level lock (localStorage, salt + SHA-256) — see lib/diary-pin.ts.

import { useEffect, useState, type FormEvent } from "react";
import { Lock, LockOpen } from "lucide-react";
import {
  DIARY_PIN_STORAGE_KEY,
  DIARY_PIN_UNLOCK_KEY,
  hashDiaryPin,
  isValidDiaryPin,
  serializeDiaryPinRecord,
} from "@/lib/diary-pin";

const inputStyle: React.CSSProperties = {
  width: "5.5rem",
  borderRadius: 10,
  border: "1px solid var(--soft-paper-edge)",
  background: "var(--soft-paper-card)",
  padding: "0.4rem 0.6rem",
  fontSize: 14,
};

export function DiaryPinButton() {
  const [hasPin, setHasPin] = useState(false);
  const [setup, setSetup] = useState(false);
  const [pin, setPin] = useState("");
  const [pinRepeat, setPinRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      // Post-mount read of a client-only device flag (localStorage); server and
      // first client render agree on `false`, matching the rest of the cabinet.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasPin(Boolean(localStorage.getItem(DIARY_PIN_STORAGE_KEY)));
    } catch {
      /* storage unavailable — treat as no PIN */
    }
  }, []);

  async function handleSet(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidDiaryPin(pin)) {
      setError("PIN — 4–6 цифр");
      return;
    }
    if (pin !== pinRepeat) {
      setError("PIN не совпадает");
      return;
    }
    setBusy(true);
    try {
      const record = await hashDiaryPin(pin);
      localStorage.setItem(DIARY_PIN_STORAGE_KEY, serializeDiaryPinRecord(record));
      sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()));
      setHasPin(true);
      setSetup(false);
      setPin("");
      setPinRepeat("");
    } finally {
      setBusy(false);
    }
  }

  function handleDisable() {
    if (!window.confirm("Отключить PIN-код Дневника?")) return;
    try {
      localStorage.removeItem(DIARY_PIN_STORAGE_KEY);
      sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY);
    } catch {
      /* ignore */
    }
    setHasPin(false);
  }

  if (setup) {
    return (
      <form onSubmit={handleSet} className="flex flex-wrap items-center gap-2" data-testid="diary-pin-setup">
        <input inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" aria-label="Новый PIN" style={inputStyle} />
        <input inputMode="numeric" autoComplete="off" value={pinRepeat} onChange={(e) => setPinRepeat(e.target.value)} placeholder="ещё раз" aria-label="Повторите PIN" style={inputStyle} />
        <button type="submit" disabled={busy} className="soft-button soft-button-primary" style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}>Сохранить</button>
        <button type="button" onClick={() => { setSetup(false); setError(null); }} className="soft-button soft-button-ghost" style={{ minHeight: "2rem", padding: "0.375rem 0.75rem", fontSize: "0.8125rem" }}>Отмена</button>
        {error && <span className="text-xs" style={{ color: "var(--soft-bordeaux)" }}>{error}</span>}
      </form>
    );
  }

  return hasPin ? (
    <button type="button" onClick={handleDisable} data-testid="diary-pin-toggle" className="soft-chip">
      <LockOpen className="size-3.5" aria-hidden="true" /> Отключить PIN-код
    </button>
  ) : (
    <button type="button" onClick={() => setSetup(true)} data-testid="diary-pin-toggle" className="soft-chip">
      <Lock className="size-3.5" aria-hidden="true" /> Установить PIN-код
    </button>
  );
}
