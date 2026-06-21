import { Info, ShieldCheck } from "lucide-react";

// Universal building blocks shown on every digital-service surface so the
// privacy promise and the reflective-use disclaimer read identically (same
// wording, same element, same place) across продукты, /checkin, /chat и т.д.

// "Приватно — видно только вам" — no implication of a public/non-private mode.
// Replaces the old per-page «Новый формат» wording (it was a one-off on tarot).
export function ProductPrivacyBadge({ className }: { className?: string }) {
  return (
    <p
      className={
        className ??
        "mt-2.5 inline-flex items-center gap-1.5 pl-7 text-xs font-medium text-[var(--soft-terracotta-dark)]"
      }
      data-testid="product-privacy-badge"
    >
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
      Приватно — видно только вам
    </p>
  );
}

// One reflective-use disclaimer, identical text + placement on every digital
// service result (product heroes, the checkin разбор, etc.). The medical/legal/
// financial caveat is no longer written into the AI answer text — it lives here.
export function ProductDisclaimer({ className }: { className?: string }) {
  return (
    <p
      className={
        className ??
        "mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--soft-ink-faint)]"
      }
      data-testid="product-disclaimer"
    >
      <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
      <span>Результат носит информационно-рефлексивный характер и не заменяет консультацию специалиста.</span>
    </p>
  );
}
