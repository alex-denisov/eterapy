"use client";

// B464 round-4 #9 — THE single PIN control for the Дневник. Replaces the two
// duplicated toggles (DiaryPinGate's «Закрыть дневник PIN-кодом» + the header
// «Установить PIN-код» that morphed into an inline form and wrapped onto the
// next row). One chip in the page header opens a Soft Clarity modal that sets,
// changes or disables the device PIN; the sidebar lock deep-links here via
// /diary?pin=setup.

import { useEffect, useState, type FormEvent } from "react";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DIARY_PIN_STORAGE_KEY,
  DIARY_PIN_UNLOCK_KEY,
  hasDiaryPinStored,
  hashDiaryPin,
  isValidDiaryPin,
  notifyDiaryPinChanged,
  parseDiaryPinRecord,
  serializeDiaryPinRecord,
  verifyDiaryPin,
} from "@/lib/diary-pin";

const MICROCOPY =
  "PIN хранится только на этом устройстве и нужен лишь для входа в Дневник. Он не заменяет пароль аккаунта и не запрашивается в письмах или чате.";

function PinFields({
  pin,
  pinRepeat,
  onPin,
  onPinRepeat,
}: {
  pin: string;
  pinRepeat: string;
  onPin: (value: string) => void;
  onPinRepeat: (value: string) => void;
}) {
  const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6);
  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        Новый PIN (4–6 цифр)
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(event) => onPin(digitsOnly(event.target.value))}
          className="soft-input w-full text-center text-lg tracking-[0.5em]"
          data-testid="diary-pin-new"
          autoFocus
        />
      </label>
      <label className="grid gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        Повторите PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pinRepeat}
          onChange={(event) => onPinRepeat(digitsOnly(event.target.value))}
          className="soft-input w-full text-center text-lg tracking-[0.5em]"
          data-testid="diary-pin-repeat"
        />
      </label>
    </div>
  );
}

export function DiaryPinControl({ autoOpen = false }: { autoOpen?: boolean }) {
  const [hasPin, setHasPin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Inside the modal: "set" (no PIN yet), "manage" (PIN on — change/disable),
  // "change" (entering a new PIN over an existing one), "confirm-disable".
  const [view, setView] = useState<"set" | "manage" | "change" | "confirm-disable">("set");
  const [pin, setPin] = useState("");
  const [pinRepeat, setPinRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Post-mount read of the client-only device flag: SSR and the first client
    // render agree on «no PIN», the real state lands after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setHasPin(hasDiaryPinStored());
  }, []);

  // Sidebar lock deep-link (?pin=setup) opens the modal right away.
  useEffect(() => {
    if (!mounted || !autoOpen) return;
    // Post-mount deep-link open (?pin=setup) — same hydration-safe pattern as
    // the mounted flag above: SSR renders the closed state, the modal opens
    // only after the client confirms the query param.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(hasDiaryPinStored() ? "manage" : "set");
    setError(null);
    setPin("");
    setPinRepeat("");
    setOpen(true);
  }, [mounted, autoOpen]);

  function openModal() {
    setError(null);
    setPin("");
    setPinRepeat("");
    setView(hasDiaryPinStored() ? "manage" : "set");
    setOpen(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidDiaryPin(pin)) {
      setError("PIN — от 4 до 6 цифр.");
      return;
    }
    if (pin !== pinRepeat) {
      setError("PIN не совпадает. Введите одинаковый код дважды.");
      return;
    }
    setBusy(true);
    try {
      const record = await hashDiaryPin(pin);
      localStorage.setItem(DIARY_PIN_STORAGE_KEY, serializeDiaryPinRecord(record));
      sessionStorage.setItem(DIARY_PIN_UNLOCK_KEY, String(Date.now()));
      notifyDiaryPinChanged();
      setHasPin(true);
      setOpen(false);
    } catch {
      setError("Не получилось сохранить PIN — попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  // Round-5 #7: выключение PIN подтверждается ТЕКУЩИМ PIN-кодом — одна кнопка
  // «Да, отключить» позволяла снять защиту любому, у кого в руках устройство.
  async function handleDisable(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidDiaryPin(pin)) {
      setError("Введите текущий PIN — от 4 до 6 цифр.");
      return;
    }
    setBusy(true);
    try {
      const record = parseDiaryPinRecord(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
      const verified = record ? await verifyDiaryPin(pin, record) : true;
      if (!verified) {
        setError("Неверный PIN. Попробуйте ещё раз.");
        return;
      }
      localStorage.removeItem(DIARY_PIN_STORAGE_KEY);
      sessionStorage.removeItem(DIARY_PIN_UNLOCK_KEY);
      notifyDiaryPinChanged();
      setHasPin(false);
      setOpen(false);
    } catch {
      /* storage unavailable — treat as removed */
      notifyDiaryPinChanged();
      setHasPin(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const showForm = view === "set" || view === "change";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        data-testid="diary-pin-toggle"
        className={hasPin ? "soft-chip soft-chip-warm" : "soft-chip"}
      >
        {hasPin ? (
          <><Lock className="size-3.5" aria-hidden="true" /> PIN-код включён</>
        ) : (
          <><LockOpen className="size-3.5" aria-hidden="true" /> Закрыть PIN-кодом</>
        )}
      </button>

      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) setOpen(false); }}>
        <DialogContent className="max-w-sm" showCloseButton data-testid="diary-pin-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              {view === "set" ? "PIN-код для Дневника" : "Дневник закрыт PIN-кодом"}
            </DialogTitle>
            <DialogDescription>{MICROCOPY}</DialogDescription>
          </DialogHeader>

          {showForm && (
            <form onSubmit={handleSave} className="grid gap-4" data-testid="diary-pin-setup">
              <PinFields pin={pin} pinRepeat={pinRepeat} onPin={setPin} onPinRepeat={setPinRepeat} />
              {error && (
                <p className="text-sm text-[var(--soft-bordeaux)]" role="alert">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="soft-button soft-button-primary flex-1 justify-center"
                  data-testid="diary-pin-save"
                >
                  {busy ? "Сохраняем..." : view === "change" ? "Сменить PIN" : "Включить PIN"}
                </button>
                <button
                  type="button"
                  className="soft-button soft-button-ghost"
                  onClick={() => (view === "change" ? setView("manage") : setOpen(false))}
                >
                  Отмена
                </button>
              </div>
              <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                Если забудете PIN — очистите данные сайта в браузере. Записи не пострадают: они хранятся в вашем аккаунте.
              </p>
            </form>
          )}

          {view === "manage" && (
            <div className="grid gap-2" data-testid="diary-pin-manage">
              <button
                type="button"
                className="soft-button soft-button-primary justify-center"
                onClick={() => { setError(null); setPin(""); setPinRepeat(""); setView("change"); }}
              >
                Сменить PIN-код
              </button>
              <button
                type="button"
                className="soft-button soft-button-ghost justify-center"
                onClick={() => { setPin(""); setError(null); setView("confirm-disable"); }}
                data-testid="diary-pin-disable"
              >
                Отключить PIN-код
              </button>
            </div>
          )}

          {view === "confirm-disable" && (
            <form onSubmit={handleDisable} className="grid gap-3" data-testid="diary-pin-confirm-disable">
              <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Дневник снова будет открываться без PIN на этом устройстве.
                Чтобы отключить защиту, введите текущий PIN.
              </p>
              <label className="grid gap-1.5 text-sm text-[var(--soft-ink-soft)]">
                Текущий PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="soft-input w-full text-center text-lg tracking-[0.5em]"
                  data-testid="diary-pin-disable-current"
                  autoFocus
                />
              </label>
              {error && (
                <p className="text-sm text-[var(--soft-bordeaux)]" role="alert">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || pin.length < 4}
                  className="soft-button soft-button-primary flex-1 justify-center"
                  data-testid="diary-pin-disable-confirm"
                >
                  {busy ? "Проверяем..." : "Да, отключить"}
                </button>
                <button type="button" className="soft-button soft-button-ghost" onClick={() => { setPin(""); setError(null); setView("manage"); }}>
                  Оставить
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
