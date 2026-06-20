import { Check } from "lucide-react";

// Shared «saved automatically» note so checkin and tarot show the exact same
// element (#10). Style lives in .tarot-autosaved-note (v4-soft.css).
export function AutosavedNote({
  label = "Сохранено в Дневнике автоматически",
  testId,
}: {
  label?: string;
  testId?: string;
}) {
  return (
    <p className="tarot-autosaved-note" data-testid={testId}>
      <Check className="size-3.5" aria-hidden="true" />
      {label}
    </p>
  );
}
