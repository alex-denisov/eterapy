/**
 * B698 — адреса Дзена.
 *
 * ⚠ ГЛАВНОЕ, ЧТО ВЫЯСНИЛА ЖИВАЯ ПРОВЕРКА 2026-08-07. Студия открывается ТОЛЬКО
 * по адресу с идентификатором канала — `/profile/editor/id/<id>`. Вид со слагом
 * (`/profile/editor/eterapy`) выглядит правдоподобно и даже появляется в адресной
 * строке ПОСЛЕ загрузки студии, но холодный переход по нему уводит на публичную
 * страницу канала — и под живой сессией владельца тоже. А `/profile/editor` без
 * канала — «Дзен. Страница не найдена» с кодом 200, и именно туда мы ходили
 * раньше: отсюда и «студия не открылась», и невозможность войти.
 *
 * Идентификатор руками никто не вводит: сервис находит его на странице канала
 * (ссылка «Продвигать канал» ведёт в студию) — тот же приём, что с адресатом
 * Meta в B693, где поле «вписанное на глаз» сделало бы сверку бессмысленной.
 *
 * ПОЧЕМУ ЗДЕСЬ, А НЕ В СЕРВИСЕ. Браузерный сервис — отдельный образ весом с
 * гигабайт, он выкатывается своим темпом и без тестов. Всё, что можно решить
 * до обращения к площадке, решается здесь, под тестами.
 */

const DZEN_HOST = "dzen.ru";

function parseDzenUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`Адрес канала Дзена не разобран: «${value}»`);
  }
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== DZEN_HOST) {
    throw new Error(`Адрес канала должен быть на dzen.ru, а указан «${parsed.hostname}»`);
  }
  if (parsed.pathname.split("/").filter(Boolean).length === 0) {
    throw new Error("В адресе канала Дзена нет самого канала, например https://dzen.ru/eterapy");
  }
  return parsed;
}

/** Публичный адрес канала — с него сервис начинает и его же показывает после входа. */
export function dzenChannelUrlFrom(channelUrl: string): string {
  const parsed = parseDzenUrl(channelUrl);
  return `https://${DZEN_HOST}${parsed.pathname.replace(/\/+$/, "")}`;
}

/**
 * Адрес студии, если идентификатор канала уже известен из настройки.
 *
 * `https://dzen.ru/id/<id>` и `https://dzen.ru/profile/editor/id/<id>` → студия.
 * Слаг (`https://dzen.ru/eterapy`) идентификатора не содержит — `null`, и тогда
 * студию ищет сервис на странице канала. Возвращать по слагу
 * `/profile/editor/eterapy` НЕЛЬЗЯ: это молча уводит на публичную страницу.
 */
export function dzenStudioUrlFrom(channelUrl: string): string | null {
  const parsed = parseDzenUrl(channelUrl);
  const id = parsed.pathname.match(/(?:^|\/)id\/([0-9a-z]{16,})/i)?.[1];
  return id ? `https://${DZEN_HOST}/profile/editor/id/${id}` : null;
}

/**
 * Адрес формы входа.
 *
 * Ведёт на Яндекс ID с возвратом на канал: со страницы самого Дзена вход не
 * начинается, а с несуществующей — тем более. Возврат именно на канал, а не в
 * студию: страница канала под владельцем показывает «Редактировать канал» —
 * это видимое глазом доказательство, что вход состоялся.
 */
export function dzenLoginUrlFrom(channelUrl: string): string {
  return `https://passport.yandex.ru/auth?retpath=${encodeURIComponent(channelUrl)}`;
}

/**
 * Текст статьи без разметки markdown.
 *
 * ⚠ ЗАЧЕМ. Конвейер пишет материал в markdown — им живут Telegram и лента. У
 * Дзена редактор визуальный: он показывает `**Что стоит проверить:**` ровно так,
 * со звёздочками. Первый живой заход это и напечатал; публиковать такое на
 * канал нельзя.
 *
 * Маркеры списка заменяются на тире, а НЕ оставляются как `- `: с дефиса
 * редактор Дзена сам заводит список, и следующие строки получают второй маркер.
 * Подчёркивания не трогаем вовсе — они живут в адресах (`utm_source`), и
 * «курсив» съел бы часть ссылки.
 */
export function dzenPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    // `[\s\S]` вместо флага `s`: он требует цели es2018, а она здесь ниже.
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "— ")
    .replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}
