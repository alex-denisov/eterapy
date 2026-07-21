/**
 * B554 п.6/16 — подписанная launch-сессия Mini App.
 *
 * Корень бага (owner: «сессия устарела, закройте приложение и откройте
 * заново»): Telegram выдаёт `initData` ОДИН раз при запуске Mini App и больше
 * его не обновляет, а сервер отвергает подпись старше пяти минут. Клиент
 * зашёл, прошёл разбор (это дольше пяти минут), нажал «связать аккаунт» —
 * и переотправил тот же, уже просроченный `initData` → STALE_INIT_DATA.
 *
 * Пятиминутное окно правильно для ПРОВЕРКИ ЗАПУСКА (защита от replay), но
 * переиспользовать `initData` для более поздних действий нельзя в принципе.
 * Поэтому подпись проверяется один раз на bootstrap, а дальше личность несёт
 * короткоживущий серверный токен.
 *
 * Токен без состояния и подписан HMAC — тем же секретом и по той же схеме, что
 * гостевая сессия. Отдельная таблица не нужна: это утверждение «этот браузер
 * прошёл проверенный запуск Telegram как subject X», действующее 6 часов, и
 * отзывать его досрочно незачем. Само по себе оно НЕ логинит: связывание
 * дополнительно требует активной сессии CLIENT.
 */
import crypto from "node:crypto";

export const MINIAPP_LAUNCH_COOKIE = "eterapy_miniapp_launch";
export const MINIAPP_LAUNCH_TTL_SECONDS = 6 * 60 * 60;

export interface TelegramLaunchSessionPayload {
  provider: "telegram";
  subjectId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  /** Unix seconds. */
  exp: number;
}

function launchSecret() {
  const configured = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mini App launch session secret is not configured");
  }
  return "development-miniapp-launch-secret";
}

function sign(body: string) {
  return crypto.createHmac("sha256", launchSecret()).update(body).digest("base64url");
}

export function createLaunchSessionCookieValue(
  launch: Omit<TelegramLaunchSessionPayload, "exp">,
  now = Date.now(),
): string {
  const payload: TelegramLaunchSessionPayload = {
    ...launch,
    exp: Math.floor(now / 1000) + MINIAPP_LAUNCH_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readLaunchSessionCookieValue(
  value: string | undefined | null,
  now = Date.now(),
): TelegramLaunchSessionPayload | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const body = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  // Длину сверяем до timingSafeEqual: он бросает на разной длине.
  if (expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TelegramLaunchSessionPayload;
    if (parsed.provider !== "telegram") return null;
    if (typeof parsed.subjectId !== "string" || !parsed.subjectId) return null;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}
