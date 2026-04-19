/**
 * Canonical registration-channel enum. Single source of truth — read from
 * `User.provider` (primary) and `User.registrationChannel` (legacy fallback).
 *
 * The DB columns are left as `String?` for backward compatibility; this module
 * normalizes any legacy value into one of the canonical tokens below.
 *
 * Canonical tokens (per BACKLOG 11.A.2):
 *   web           — desktop / laptop browser on the main site
 *   web_mobile    — mobile browser
 *   VK_app        — VK mini apps
 *   Facebook_app  — Facebook / Meta embedded app
 *   max           — Max messenger mini app
 *   telegram      — Telegram mini app / signup via bot
 *   ios           — native iOS app
 *   android       — native Android app
 *   manual        — created by admin or moderator via panel
 */

export type RegistrationChannel =
  | "web"
  | "web_mobile"
  | "VK_app"
  | "Facebook_app"
  | "max"
  | "telegram"
  | "ios"
  | "android"
  | "manual";

export const REGISTRATION_CHANNELS: readonly RegistrationChannel[] = [
  "web", "web_mobile", "VK_app", "Facebook_app", "max", "telegram", "ios", "android", "manual",
] as const;

const LEGACY_MAP: Record<string, RegistrationChannel> = {
  // legacy provider values → canonical
  "web":         "web",
  "site":        "web",
  "google":      "web",          // Google OAuth still arrives via the web form
  "mobile_web":  "web_mobile",
  "vk":          "VK_app",
  "vk_app":      "VK_app",
  "VK":          "VK_app",
  "facebook":    "Facebook_app",
  "fb_app":      "Facebook_app",
  "max":         "max",
  "telegram":    "telegram",
  "tg":          "telegram",
  "referral":    "web",          // referral is a web signup path, collapse
  "ios":         "ios",
  "android":     "android",
  "manual":      "manual",
};

const LABELS_RU: Record<RegistrationChannel, string> = {
  web:          "Сайт (desktop)",
  web_mobile:   "Сайт (mobile)",
  VK_app:       "VK mini apps",
  Facebook_app: "Facebook app",
  max:          "Max messenger",
  telegram:     "Telegram",
  ios:          "iOS приложение",
  android:      "Android приложение",
  manual:       "Создан вручную",
};

interface ChannelInput {
  provider?: string | null;
  registrationChannel?: string | null;
}

/**
 * Resolve the canonical channel for a user. Prefers `provider`; falls back to
 * the legacy `registrationChannel` column; defaults to `web`.
 */
export function resolveRegistrationChannel(u: ChannelInput): RegistrationChannel {
  const raw = (u.provider ?? u.registrationChannel ?? "").trim();
  if (!raw) return "web";
  return LEGACY_MAP[raw] ?? LEGACY_MAP[raw.toLowerCase()] ?? "web";
}

export function registrationChannelLabel(channel: RegistrationChannel): string {
  return LABELS_RU[channel];
}
