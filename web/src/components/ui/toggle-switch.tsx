"use client";

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

/**
 * Универсальный переключатель (toggle switch).
 * Заменяет дублирующиеся inline-реализации в schedule-settings,
 * price-rates-editor и price-rates-viewer.
 */
export function ToggleSwitch({
  enabled,
  onToggle,
  disabled = false,
  label,
  id,
}: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        enabled ? "bg-primary" : "bg-muted/40"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
