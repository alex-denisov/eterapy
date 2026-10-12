/**
 * B760 — контекст возврата гостя к услуге после входа, регистрации и
 * подтверждения почты.
 *
 * Один хелпер на все переходы между `/login`, `/register` и письмом
 * подтверждения: раньше контекст (`next`, `intent`, `productKey`) терялся на
 * ссылке «Создать», регистрация его не читала вовсе, а письмо вело на `/login`
 * без `next`. Безопасность адреса — одна проверка на всех: только локальный
 * путь, без `//` и обратных слэшей.
 */

export interface AuthReturnContext {
  next: string | null;
  intent: string | null;
  productKey: string | null;
}

export const EMPTY_AUTH_RETURN: AuthReturnContext = { next: null, intent: null, productKey: null };

export function getSafeRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  // Управляющие символы браузер вырезает при разборе адреса: "/\n/evil.com" стал бы "//evil.com".
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

interface ParamSource {
  get(name: string): string | null;
}

const SAFE_TOKEN = /^[\w.:-]{1,80}$/;

export function readAuthReturn(params: ParamSource): AuthReturnContext {
  const intent = params.get("intent");
  const productKey = params.get("productKey");
  return {
    next: getSafeRedirectPath(params.get("next")),
    intent: intent && SAFE_TOKEN.test(intent) ? intent : null,
    productKey: productKey && SAFE_TOKEN.test(productKey) ? productKey : null,
  };
}

/** `?next=…&intent=…&productKey=…` (только то, что есть) + дополнительные параметры. */
export function authReturnQuery(context: AuthReturnContext, extra: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams();
  if (context.next) query.set("next", context.next);
  if (context.intent) query.set("intent", context.intent);
  if (context.productKey) query.set("productKey", context.productKey);
  for (const [key, value] of Object.entries(extra)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function authLink(path: "/login" | "/register", context: AuthReturnContext, extra?: Record<string, string | null | undefined>): string {
  return `${path}${authReturnQuery(context, extra)}`;
}

/** Гость пришёл с конкретной услуги или сохраняет ответ — подарок уместно упомянуть. */
export function cameFromService(context: AuthReturnContext): boolean {
  return Boolean(context.next || context.intent);
}
