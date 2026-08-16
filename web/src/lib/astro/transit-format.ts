/**
 * B711 · Показ посчитанных интервалов человеку.
 *
 * ⚠ ЧАСОВОЙ ПОЯС НАЗЫВАЕТСЯ, А НЕ ПОДРАЗУМЕВАЕТСЯ. Расчёт идёт в UTC, а
 * читатель живёт в своём поясе; момент входа Луны в знак у быстрых светил
 * решает, каким будет знак у родившегося в этот день. Поэтому всё, что
 * показывается, приводится к одному явно названному поясу — московскому, — и
 * подпись про это стоит рядом с таблицей. Без подписи таблица врёт на три часа
 * молча.
 *
 * Модуль без React и без эфемерид: его зовут и сборка страницы, и клиентский
 * калькулятор.
 */

export const DISPLAY_TIME_ZONE = "Europe/Moscow";
/** Смещение московского времени от UTC в минутах. Перехода на летнее время нет с 2014 года. */
export const DISPLAY_UTC_OFFSET_MINUTES = 180;

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTransitDate(value: Date): string {
  return dateFormat.format(value);
}

export function formatTransitMoment(value: Date): string {
  return dateTimeFormat.format(value);
}

/** Длительность интервала человеческой фразой: «2 дня 7 часов», «11 лет 4 месяца». */
export function formatDuration(from: Date, to: Date): string {
  const hours = Math.round((to.getTime() - from.getTime()) / 3_600_000);
  if (hours < 24) return `${hours} ч`;
  // Луна стоит в знаке около 53 часов. Округление до суток превратило бы все
  // тринадцать строк её таблицы в одинаковые «2 дн.» и стёрло бы ровно ту
  // разницу, ради которой таблицу и считают.
  if (hours < 96) {
    const restHours = hours % 24;
    const whole = Math.floor(hours / 24);
    return restHours === 0 ? `${whole} дн.` : `${whole} дн. ${restHours} ч`;
  }
  const days = Math.round(hours / 24);
  if (days < 90) return `${days} дн.`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} мес.`;
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths === 0 ? `${years} г.` : `${years} г. ${restMonths} мес.`;
}

/**
 * Момент, введённый человеком как местное время, в UTC.
 *
 * Час рождения человек называет по своим часам, а не по Гринвичу. Мы честно
 * трактуем его как московский и говорим об этом в подписи к полю: без единой
 * договорённости знак у родившегося вблизи границы получался бы то одним, то
 * другим в зависимости от того, где открыли страницу.
 */
export function localInputToUtc(year: number, month: number, day: number, hours: number, minutes: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - DISPLAY_UTC_OFFSET_MINUTES * 60_000);
}
