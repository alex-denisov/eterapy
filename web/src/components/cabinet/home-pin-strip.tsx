"use client";

import { CheckCircle2, Lock, LockOpen } from "lucide-react";
import { DiaryPinControl } from "@/components/cabinet/diary-pin-control";

// B512 R1-6 (owner 2026-07-15) — trust-strip Главной стал КЛИКАБЕЛЬНЫМ
// управлением PIN-кодом Дневника: клик открывает ту же модалку установки/
// смены/отключения PIN, что и в разделе «Дневник» (DiaryPinControl).
export function HomePinStrip() {
  return (
    <DiaryPinControl
      renderTrigger={(openModal, hasPin) => (
        <button
          type="button"
          onClick={openModal}
          data-testid="client-trust-strip"
          data-pin-set={hasPin ? "1" : "0"}
          className="flex w-full items-center gap-3.5 rounded-[13px] border border-[var(--soft-paper-edge)] px-4 py-3 text-left transition-colors hover:border-[var(--soft-terracotta)]"
          style={{ background: "color-mix(in srgb, var(--soft-paper-deep) 62%, var(--soft-paper))" }}
          title={hasPin ? "PIN-код включён — настроить" : "Закрыть Дневник PIN-кодом"}
        >
          <span
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]"
            style={{ color: "var(--soft-sage-ink, #4B6146)" }}
          >
            {hasPin ? <Lock className="size-4" aria-hidden="true" /> : <LockOpen className="size-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium" style={{ color: "var(--soft-ink)" }}>
              Ваши разборы и Дневник видите только вы
            </span>
            <span className="block text-[11.5px]" style={{ color: "var(--soft-ink-faint)" }}>
              {hasPin
                ? "Дневник закрыт PIN-кодом — нажмите, чтобы сменить или отключить. Хранение — по 152-ФЗ."
                : "Нажмите, чтобы закрыть Дневник PIN-кодом. Хранение и обработка — по 152-ФЗ."}
            </span>
          </span>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            style={
              hasPin
                ? { background: "var(--soft-sage, #E4EADF)", color: "var(--soft-sage-ink, #4B6146)" }
                : { background: "var(--soft-paper-card)", color: "var(--soft-ink-soft)", border: "1px solid var(--soft-paper-edge)" }
            }
          >
            <CheckCircle2 className="size-3" aria-hidden="true" />
            {hasPin ? "Под PIN-кодом" : "Включить PIN"}
          </span>
        </button>
      )}
    />
  );
}
