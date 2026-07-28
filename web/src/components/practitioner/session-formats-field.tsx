"use client";

import { SESSION_FORMATS, normalizeOfferedFormats } from "@/lib/session-formats";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** compact styling for the admin modal */
  dense?: boolean;
}

/**
 * B466/B480 — «Форматы сессий» editor shared by the practitioner profile editor
 * (cabinet «Услуги/Профиль») and the superadmin user modal. Individual is always
 * offered (locked on); couple/family are opt-in toggles. Formats do NOT change
 * pricing — the note makes that explicit.
 */
export function SessionFormatsField({ value, onChange, dense = false }: Props) {
  const selected = new Set(normalizeOfferedFormats(value));

  function toggle(id: string) {
    if (id === "individual") return; // individual нельзя отключить
    const next = selected.has(id)
      ? [...selected].filter((f) => f !== id)
      : [...selected, id];
    onChange(normalizeOfferedFormats(next));
  }

  const chip = (active: boolean, locked: boolean) =>
    dense
      ? `rounded-md border px-2.5 py-1 text-xs transition-colors ${
          active
            ? "border-transparent bg-[var(--soft-bordeaux)]/10 text-[var(--soft-bordeaux)] font-medium"
            : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-ink-faint)]"
        } ${locked ? "cursor-default opacity-90" : ""}`
      : `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          active
            ? "border-transparent soft-select-pill font-medium"
            : "border-border/30 text-[var(--soft-ink-soft)] hover:border-border/60"
        } ${locked ? "cursor-default" : ""}`;

  const heading = dense
    ? "text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]"
    : "font-semibold mb-1";

  return (
    <div>
      <p className={heading}>Форматы сессий</p>
      {!dense && (
        <p className="text-xs text-[var(--soft-ink-soft)]/60 mb-2">
          С кем вы проводите сессии. Клиенты видят это в каталоге; вы выбираете формат при записи
          клиента. На цену не влияет — стоимость закреплена за длительностью.
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-1.5" data-testid="session-formats-field">
        {SESSION_FORMATS.map((f) => {
          const active = selected.has(f.id);
          const locked = f.id === "individual";
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f.id)}
              className={chip(active, locked)}
              aria-pressed={active}
              aria-disabled={locked}
              title={locked ? "Индивидуальные сессии доступны всегда" : f.hint}
            >
              {f.label}
              {locked ? " · всегда" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
