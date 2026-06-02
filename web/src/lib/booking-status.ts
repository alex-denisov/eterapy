/**
 * Единый справочник статусов бронирований.
 * Используется во всех компонентах: bookings-list, cabinet/bookings, admin/bookings, practitioner/clients.
 */

export interface BookingStatusConfig {
  label: string;
  color: string;
}

// W7: readable, high-contrast status pills — DARK text (700/800) on a light
// tint (100). The old light text-*-400 on bg-*/10 rendered "green on green"
// in the light Soft-Clarity cabinets. One source, shared by the client cabinet,
// the practitioner clients table and the admin panels, so the scheme is unified.
export const BOOKING_STATUS: Record<string, BookingStatusConfig> = {
  PENDING:     { label: "Ожидает",          color: "bg-amber-100 text-amber-800" },
  CONFIRMED:   { label: "Подтверждено",     color: "bg-emerald-100 text-emerald-700" },
  IN_PROGRESS: { label: "Идёт сессия",      color: "bg-sky-100 text-sky-700" },
  COMPLETED:   { label: "Завершена",        color: "bg-[color-mix(in_srgb,var(--soft-bordeaux)_12%,transparent)] text-[var(--soft-bordeaux)]" },
  CANCELLED:   { label: "Отменена",         color: "bg-[color-mix(in_srgb,var(--soft-ink)_8%,transparent)] text-[var(--soft-ink-soft)]" },
  DISPUTED:    { label: "Жалоба",           color: "bg-red-100 text-red-700" },
  REFUNDED:    { label: "Возврат",          color: "bg-orange-100 text-orange-700" },
  EXPIRED:     { label: "Истекло",          color: "bg-[color-mix(in_srgb,var(--soft-ink)_8%,transparent)] text-[var(--soft-ink-soft)]" },
};

export function getBookingStatus(status: string): BookingStatusConfig {
  return BOOKING_STATUS[status] ?? { label: status, color: "bg-[color-mix(in_srgb,var(--soft-ink)_8%,transparent)] text-[var(--soft-ink-soft)]" };
}
