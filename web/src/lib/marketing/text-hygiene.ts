/**
 * B724 — очистка невидимых водяных знаков и символов нулевой ширины,
 * вставляемых генеративными моделями (по паттернам watermarks-remover / openqareer B210).
 *
 * Удаляет:
 * - \u200B (zero-width space)
 * - \u200C (zero-width non-joiner)
 * - \u200E, \u200F (left-to-right / right-to-left marks)
 * - \u2060 (word joiner)
 * - \u2061..\u2064 (invisible operators)
 * - \uFEFF (zero-width no-break space / byte order mark)
 * - \u00AD (soft hyphen)
 * - U+E0000..U+E007F (Unicode Tag characters)
 */

export const HIDDEN_MARKERS_PATTERN = /[\u200B\u200C\u200E\u200F\u2060-\u2064\uFEFF\u00AD]|[\u{E0000}-\u{E007F}]/gu;

export function stripHiddenMarkers(text: string): string {
  if (!text) return "";
  return text.replace(HIDDEN_MARKERS_PATTERN, "");
}

export function hasHiddenMarkers(text: string): boolean {
  if (!text) return false;
  return /[\u200B\u200C\u200E\u200F\u2060-\u2064\uFEFF\u00AD]|[\u{E0000}-\u{E007F}]/u.test(text);
}
