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
 * B458 (item 14) — минимальная длина обязательного контекста. Защищает от
 * пустого / односимвольного ввода («.») при первой записи, не блокируя короткие
 * осмысленные формулировки («стресс», «выгорание»).
 */
export const MEETING_CONTEXT_MIN = 3;

/** Сообщение об ошибке, если обязательный контекст не заполнен. */
export const MEETING_CONTEXT_REQUIRED_ERROR =
  "Опишите, с чем хотите разобраться — это поможет специалисту подготовиться к встрече.";

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

/**
 * B458 (item 14) — контекст обязателен при ПЕРВОЙ записи к новому специалисту
 * (та же ветка, что и `askContext`/`shouldRequestMeetingContext`). При повторной
 * записи к тому же специалисту он не запрашивается и поэтому не обязателен.
 */
export function isMeetingContextRequired(opts: { isFirstBookingWithPractitioner: boolean }): boolean {
  return opts.isFirstBookingWithPractitioner === true;
}

/**
 * Валидирует контекст на границе системы. Возвращает очищенное значение либо
 * причину отказа, чтобы и клиент, и сервер применяли одно и то же правило.
 */
export function validateMeetingContext(
  raw: unknown,
  opts: { required: boolean },
): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = sanitizeMeetingContext(raw);
  if (opts.required && (!value || value.length < MEETING_CONTEXT_MIN)) {
    return { ok: false, error: MEETING_CONTEXT_REQUIRED_ERROR };
  }
  return { ok: true, value };
}
