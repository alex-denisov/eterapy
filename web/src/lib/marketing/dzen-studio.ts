/**
 * B698 — адреса Дзена, выведенные из адреса канала.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Студия Дзена живёт по адресу `/profile/editor/<канал>`,
 * и канал в нём обязателен. Мы ходили на `/profile/editor` без канала — площадка
 * отдаёт на него «Дзен. Страница не найдена» с кодом 200. Этот один неверный
 * адрес стоял сразу в двух местах и стоил владельцу возможности войти: окно
 * входа открывалось на 404-странице, где нет ни одной кнопки.
 *
 * ПОЧЕМУ ЗДЕСЬ, А НЕ В СЕРВИСЕ. Браузерный сервис — отдельный образ весом с
 * гигабайт, он выкатывается своим темпом и без тестов. Устройство адресов
 * площадки меняется чаще Chromium, поэтому знание о нём держится в приложении,
 * под тестами, и уезжает в сервис параметром запроса.
 */

const DZEN_HOST = "dzen.ru";

/**
 * Адрес студии по адресу канала.
 *
 * `https://dzen.ru/eterapy`      → `https://dzen.ru/profile/editor/eterapy`
 * `https://dzen.ru/id/<id>`      → `https://dzen.ru/profile/editor/id/<id>`
 * `https://dzen.ru/profile/editor/eterapy` → он же, без хвостов
 */
export function dzenStudioUrlFrom(channelUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(channelUrl.trim());
  } catch {
    throw new Error(`Адрес канала Дзена не разобран: «${channelUrl}»`);
  }

  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== DZEN_HOST) {
    throw new Error(`Адрес канала должен быть на dzen.ru, а указан «${parsed.hostname}»`);
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const channel = segments[0] === "profile" && segments[1] === "editor" ? segments.slice(2) : segments;
  if (channel.length === 0) {
    throw new Error(
      "В адресе канала Дзена нет самого канала: студия открывается по адресу " +
      "/profile/editor/<канал>, например https://dzen.ru/eterapy",
    );
  }

  return `https://${DZEN_HOST}/profile/editor/${channel.join("/")}`;
}

/**
 * Адрес формы входа.
 *
 * Ведёт на Яндекс ID с возвратом в студию: со страницы самого Дзена войти
 * нельзя, а с несуществующей — тем более. Если сессия жива, паспорт сразу
 * вернёт владельца по `retpath`, и окно откроется на студии.
 */
export function dzenLoginUrlFrom(studioUrl: string): string {
  return `https://passport.yandex.ru/auth?retpath=${encodeURIComponent(studioUrl)}`;
}
