/**
 * B379 (M26) — «контекст встречи»: клиент описывает, с чем хочет разобраться,
 * при первой записи к специалисту. Контекст — чувствительные данные клиента:
 * доступ только у самого клиента, назначенного специалиста и админов
 * (контроль доступа обеспечивают уже существующие scoped-запросы бронирований).
 *
 * Правило повторного контекста: новый специалист → спросить; повторная запись
 * к тому же специалисту → не спрашивать (он уже знаком с запросом).
 */

/** Максимальная длина контекста встречи (символов). */
export const MEETING_CONTEXT_MAX = 600;

/**
 * Нужно ли запрашивать контекст у клиента перед записью.
 *
 * @param practitionerId    специалист, к которому записываются сейчас
 * @param visitedPractitionerIds  специалисты, к которым клиент уже записывался
 * @returns true — спросить контекст (новый специалист); false — пропустить (повтор)
 */
export function shouldRequestMeetingContext(opts: {
  practitionerId: string;
  visitedPractitionerIds: readonly string[];
}): boolean {
  return !opts.visitedPractitionerIds.includes(opts.practitionerId);
}

/**
 * Нормализует пользовательский ввод контекста: тримминг, обрезка по лимиту,
 * пустая строка → null (контекст не сохраняется). Защищает границу системы от
 * нестроковых/переразмерных значений (см. правило «валидируй на границе»).
 */
export function sanitizeMeetingContext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MEETING_CONTEXT_MAX);
  return trimmed.length > 0 ? trimmed : null;
}
