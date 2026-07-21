/**
 * B554 п.6/16 — launch-сессия Mini App.
 *
 * Owner: «я зашел под telegram id, прошел разбор, затем захотел
 * залогиниться/связать аккаунт, а получил "сессия устарела"». Корень —
 * переиспользование `initData`, который Telegram выдаёт один раз за запуск и
 * не обновляет, при серверном окне свежести в пять минут.
 */
import {
  createLaunchSessionCookieValue,
  MINIAPP_LAUNCH_TTL_SECONDS,
  readLaunchSessionCookieValue,
} from "@/lib/miniapp/telegram/launch-session";

const LAUNCH = {
  provider: "telegram" as const,
  subjectId: "554123",
  username: "client",
  firstName: "Алексей",
  lastName: null,
};

describe("B554 launch-сессия", () => {
  it("переживает окно свежести initData", () => {
    const issued = createLaunchSessionCookieValue(LAUNCH);
    // Через 30 минут — заведомо позже пятиминутного окна `initData`, ровно тот
    // момент, когда owner нажимал «связать аккаунт».
    const later = Date.now() + 30 * 60_000;
    expect(readLaunchSessionCookieValue(issued, later)?.subjectId).toBe("554123");
  });

  it("истекает по своему сроку", () => {
    const issued = createLaunchSessionCookieValue(LAUNCH);
    const afterTtl = Date.now() + (MINIAPP_LAUNCH_TTL_SECONDS + 60) * 1000;
    expect(readLaunchSessionCookieValue(issued, afterTtl)).toBeNull();
  });

  it("отвергает подделку подписи и тела", () => {
    const issued = createLaunchSessionCookieValue(LAUNCH);
    const [body, signature] = [issued.slice(0, issued.lastIndexOf(".")), issued.slice(issued.lastIndexOf(".") + 1)];

    // Тело подменено на чужой subjectId, подпись оставлена родная.
    const forgedBody = Buffer.from(
      JSON.stringify({ ...LAUNCH, subjectId: "999999", exp: Math.floor(Date.now() / 1000) + 600 }),
      "utf8",
    ).toString("base64url");
    expect(readLaunchSessionCookieValue(`${forgedBody}.${signature}`)).toBeNull();

    // Подпись испорчена, тело родное.
    expect(readLaunchSessionCookieValue(`${body}.${"x".repeat(signature.length)}`)).toBeNull();
  });

  it("отвергает мусор и пустое значение", () => {
    expect(readLaunchSessionCookieValue(null)).toBeNull();
    expect(readLaunchSessionCookieValue("")).toBeNull();
    expect(readLaunchSessionCookieValue("no-separator")).toBeNull();
    expect(readLaunchSessionCookieValue(".onlysig")).toBeNull();
  });
});
