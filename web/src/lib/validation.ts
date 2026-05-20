/**
 * Validation utilities for form input sanitization and validation.
 * Applied globally across all forms in the ETerapy platform.
 */

/**
 * Sanitize name input: only Cyrillic + Latin letters, spaces, and hyphens. Max 50 chars.
 */
export function sanitizeName(input: string): string {
  return input.replace(/[^a-zA-Zа-яА-ЯёЁ\s-]/g, "").slice(0, 50);
}

/**
 * Sanitize email input: allow only valid email characters, remove "+". Max 50 chars.
 */
export function sanitizeEmail(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9._@-]/g, "").replace(/\+/g, "");
  return cleaned.slice(0, 50);
}

/**
 * Sanitize username input: only Latin letters, digits, and underscores. Max 50 chars.
 */
export function sanitizeUsername(input: string): string {
  return input.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 50);
}

/**
 * Sanitize text input: truncate to max length.
 */
export function sanitizeText(input: string, maxLen: number): string {
  return input.slice(0, maxLen);
}

/**
 * Validate email format: no "+", valid format, max 50 chars.
 */
export function validateEmail(email: string): boolean {
  const noAlias = !email.includes("+");
  const validFormat = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  return noAlias && validFormat && email.length <= 50;
}

/**
 * Validate name: only Cyrillic + Latin letters, spaces, hyphens. Non-empty, max 50 chars.
 */
export function validateName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 50) return false;
  return /^[a-zA-Zа-яА-ЯёЁ\s-]+$/.test(trimmed);
}

/**
 * Validate Telegram username: Latin letters, digits, underscores, optional leading "@". Max 50 chars.
 */
export function validateTelegramUsername(username: string): boolean {
  const cleaned = username.replace(/^@/, "");
  if (cleaned.length === 0 || cleaned.length > 50) return false;
  return /^[a-zA-Z0-9_]+$/.test(cleaned);
}

/**
 * Validate text length: non-empty (optional), max length.
 */
export function validateTextLength(text: string, minLen: number = 0, maxLen: number): boolean {
  if (text.length < minLen || text.length > maxLen) return false;
  return true;
}

/**
 * Get validation error message for name field.
 */
export function getNameError(name: string): string | null {
  if (!name.trim()) return "Введите имя";
  if (!validateName(name)) return "Имя может содержать только буквы, пробелы и дефисы";
  if (name.length > 50) return "Имя слишком длинное (макс. 50 символов)";
  return null;
}

/**
 * Get validation error message for email field.
 */
export function getEmailError(email: string): string | null {
  if (!email.trim()) return "Введите email";
  if (email.includes("+")) return 'Email не должен содержать символ "+"';
  if (!validateEmail(email)) return "Введите корректный email";
  return null;
}

/**
 * Get validation error message for Telegram username field.
 */
export function getTelegramError(username: string): string | null {
  if (!username.trim()) return null; // optional field
  const cleaned = username.replace(/^@/, "");
  if (cleaned.length > 50) return "Имя пользователя слишком длинное (макс. 50 символов)";
  if (!validateTelegramUsername(username)) return "Telegram может содержать только латинские буквы, цифры и подчёркивание";
  return null;
}
