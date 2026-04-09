/**
 * Единый справочник статусов бронирований.
 * Используется во всех компонентах: bookings-list, cabinet/bookings, admin/bookings, practitioner/clients.
 */

export interface BookingStatusConfig {
  label: string;
  color: string;
}

export const BOOKING_STATUS: Record<string, BookingStatusConfig> = {
  PENDING:     { label: "Ожидает",          color: "bg-yellow-500/10 text-yellow-400" },
  CONFIRMED:   { label: "Подтверждено",     color: "bg-green-500/10 text-green-400" },
  IN_PROGRESS: { label: "Идёт сессия",      color: "bg-blue-500/10 text-blue-400" },
  COMPLETED:   { label: "Завершена",        color: "bg-primary/10 text-primary" },
  CANCELLED:   { label: "Отменена",         color: "bg-border/30 text-muted-foreground" },
  DISPUTED:    { label: "Жалоба",           color: "bg-destructive/10 text-destructive" },
  REFUNDED:    { label: "Возврат",          color: "bg-orange-500/10 text-orange-400" },
};

export function getBookingStatus(status: string): BookingStatusConfig {
  return BOOKING_STATUS[status] ?? { label: status, color: "bg-border/20 text-muted-foreground" };
}
