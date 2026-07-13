// B466 — shared row shape for the practitioner «Клиенты» list. The interactive
// lists live in `clients-master-desktop.tsx` (desktop master-detail) and
// `clients-mobile*.tsx` (mobile); both, plus the page loader, consume this type.
// (Kept in this filename so the four `import type { ClientListRow }` sites stay
// stable after the desktop list moved to the master-detail layout in R9-5.)

export interface ClientListRow {
  id: string;
  label: string;
  sessionsCount: number;
  sinceLabel: string;
  nextLabel: string | null;
  attention: "разбор" | "новый" | null;
}
