/**
 * Central environment configuration — single source of truth for domain,
 * branding, and service endpoints.
 *
 * Why this file exists
 * --------------------
 * Domain names, the product Telegram bot, the "from" email address and the
 * payment-gateway base URL used to be hardcoded (or duplicated as inline
 * `?? "eterapy.com"` fallbacks) across ~20 modules. That made a separate
 * staging/dev contour impossible without editing source. Centralising them
 * here means a staging build only has to override environment variables.
 *
 * Design constraints
 * ------------------
 * 1. This module is imported by CLIENT components (via `subdomain.ts`), so it
 *    MUST stay dependency-free. Do not import zod or any runtime library here —
 *    it would be bundled into the browser payload.
 * 2. `NEXT_PUBLIC_*` values are statically inlined by Next.js at build time,
 *    so each must be referenced as a literal `process.env.NEXT_PUBLIC_X`
 *    expression — never via dynamic `process.env[key]` access.
 * 3. Defaults intentionally point at the production `eterapy.com` topology so
 *    existing production builds keep working with zero behaviour change. A
 *    staging build overrides them through its own env values.
 */

// ─── Public (client + server): domains ──────────────────────────────────────
export const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN ?? "eterapy.com";
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "app.eterapy.com";
export const ADMIN_DOMAIN = process.env.NEXT_PUBLIC_ADMIN_DOMAIN ?? "admin.eterapy.com";

/**
 * Canonical public origin (scheme + host), e.g. `https://eterapy.com`.
 * Used for absolute links in emails, payment-redirect URLs, and OAuth
 * redirect_uri values. Falls back to the main domain when not set explicitly.
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? `https://${MAIN_DOMAIN}`;

// ─── Public (client + server): product Telegram bot ─────────────────────────
/**
 * Bot username WITHOUT the leading `@`. Server code reads `TELEGRAM_BOT_USERNAME`;
 * client code only ever sees the public `NEXT_PUBLIC_*` variant. Keeping both
 * here means a staging deploy points at `@eterapy_staging_bot` via env alone.
 */
export const TELEGRAM_BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ??
  process.env.TELEGRAM_BOT_USERNAME ??
  "eterapy_bot";

/** Public deep-link to the product bot, e.g. `https://t.me/eterapy_bot`. */
export const TELEGRAM_BOT_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ??
  `https://t.me/${TELEGRAM_BOT_USERNAME}`;

/**
 * Call-time variant of {@link TELEGRAM_BOT_USERNAME} for SERVER code that must
 * reflect the current `process.env` (tests that override the username per-case,
 * or a PM2 reload with `--update-env`). The top-level const above is captured
 * at module load and cannot see later mutations; this function re-reads on each
 * call. Do not use in client components — `process.env.TELEGRAM_BOT_USERNAME`
 * is not exposed to the browser.
 */
export function telegramBotUsername(): string {
  return (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ??
    process.env.TELEGRAM_BOT_USERNAME ??
    "eterapy_bot"
  );
}

// ─── Server-only: transactional email ───────────────────────────────────────
/** RFC-5322 "from" header for all outgoing transactional mail. */
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "ETerapy <noreply@eterapy.com>";

/** Inbox that receives admin notifications (new applications, complaints). */
export const ADMIN_NOTIFICATION_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL ?? "admin@eterapy.com";

// ─── Server-only: payments ──────────────────────────────────────────────────
/**
 * YooKassa REST base URL. Defaults to the live API. A staging deploy that uses
 * a sandbox shop keeps this URL but supplies `test_*` credentials; if YooKassa
 * ever exposes a separate sandbox host it can be overridden here via env.
 */
export const YUKASSA_API_URL =
  process.env.YUKASSA_API_URL ?? "https://api.yookassa.ru/v3";

// ─── Server-only: Yandex AI Studio ──────────────────────────────────────────
export const YANDEX_API_KEY = process.env.YANDEX_API_KEY ?? "";
export const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID ?? "";
export const YANDEX_API_BASE =
  process.env.YANDEX_API_BASE ?? "https://llm.api.cloud.yandex.net/foundationModels/v1";

export function getYandexAIStudioEnv() {
  return {
    apiKey: process.env.YANDEX_API_KEY?.trim() ?? "",
    folderId: process.env.YANDEX_FOLDER_ID?.trim() ?? "",
    baseURL: process.env.YANDEX_API_BASE?.trim() || YANDEX_API_BASE,
  };
}

/**
 * Non-throwing sanity check for server startup / instrumentation. Logs a
 * warning when running under NODE_ENV=production with domain variables left at
 * their compiled-in defaults, which usually means the build was produced
 * without the required `NEXT_PUBLIC_*` values. Intentionally does NOT throw:
 * Next.js evaluates modules during build and an exception here would brick the
 * pipeline. Call it from server-only code (e.g. instrumentation.ts).
 */
export function reportEnvConfig(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (process.env.NODE_ENV === "production") {
    if (!process.env.NEXT_PUBLIC_MAIN_DOMAIN) {
      warnings.push("NEXT_PUBLIC_MAIN_DOMAIN is not set — using default eterapy.com");
    }
    if (!process.env.NEXT_PUBLIC_APP_DOMAIN) {
      warnings.push("NEXT_PUBLIC_APP_DOMAIN is not set — using default app.eterapy.com");
    }
    if (!process.env.NEXT_PUBLIC_ADMIN_DOMAIN) {
      warnings.push("NEXT_PUBLIC_ADMIN_DOMAIN is not set — using default admin.eterapy.com");
    }
  }
  return { ok: warnings.length === 0, warnings };
}
