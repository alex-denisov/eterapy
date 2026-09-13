/**
 * B713 §5 — «выпускать нечего» обязано быть слышно.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ. Замер прода 17.08: в маркетинговый канал
 * (`TELEGRAM_ETERAPY_MARKETING_CHAT_ID`) приходят ровно три события — карточка
 * «Опубликовано», входящее из соцсетей и карточка премодерации. За две недели
 * 198 материалов умерли, не дойдя до выпуска, и это дало НОЛЬ сообщений.
 * Владелец видел молчащий канал и не мог отличить работающий конвейер от
 * вставшего — ровно та неразличимость, ради которой заводился B653, только с
 * другой стороны: тогда не было видно успеха, теперь не видно отказа.
 *
 * Требование владельца 2026-08-17 дословно: «нужно чтобы в канал шли
 * уведомления о публикациях на всех площадках <...>, а также сообщения о том
 * что нет материалов для выпуска (исчерпание емкости, ошибки которые
 * препятствуют готовящемуся выпуску материала)».
 *
 * ⚠ B742 — СПИСКА МОЛЧАЩИХ ПЛОЩАДОК БОЛЬШЕ НЕТ. Он существовал ради одного
 * Reddit: площадка не была подключена осознанно, её отказ повторялся в КАЖДОМ
 * проходе публикатора, и уведомление о нём было бы не сигналом, а фоном.
 * Reddit убран решением владельца 2026-09-12, и фильтр, который теперь не
 * отсеивает ничего, удалён вместе с ним: пустой список молча превратился бы в
 * приглашение занести туда живую площадку и перестать слышать её отказы.
 *
 * ⚠ ПОЧЕМУ СВОДКА, А НЕ СТРОКА НА КАЖДУЮ СМЕРТЬ. 10–14 смертей в сутки — это
 * 10–14 сообщений, и на третий день их перестают читать. Одно сообщение с
 * разбивкой по причинам отвечает на тот же вопрос и остаётся читаемым.
 *
 * Текст собирается ЧИСТОЙ функцией: содержимое проверяется прогоном, а не
 * живой отправкой в Telegram (то же решение, что в `publish-notification`).
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { sendTelegram } from "@/lib/telegram";
import { marketingDeliveryTargets } from "@/lib/ops-notification-channel";

export interface ShortfallCause {
  /** Человеческая причина: она и попадёт в канал. */
  reason: string;
  platform: string;
  /** Сколько материалов встало по этой причине. */
  count: number;
}

export interface ShortfallInput {
  /** Сколько слотов конвейер должен был закрыть за период. */
  plannedSlots: number;
  /** Сколько материалов реально вышло. */
  published: number;
  /** Почему остальные не вышли. */
  causes: readonly ShortfallCause[];
  /** Площадки, у которых пул моделей отказал целиком. */
  capacityExhausted: readonly string[];
  since: Date;
  until: Date;
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function moscow(value: Date) {
  return value.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  });
}

/**
 * Есть ли о чём сообщать.
 *
 * Молчим ровно в одном случае: конвейер закрыл всё, что планировал. Тогда
 * сообщение было бы шумом — про успех уже пришли карточки «Опубликовано».
 */
export function shortfallWorthReporting(input: ShortfallInput): boolean {
  if (input.causes.length === 0 && input.capacityExhausted.length === 0) return false;
  return input.published < input.plannedSlots;
}

/**
 * Текст сводки. Один экран: что должно было выйти, что вышло, чего не хватило
 * и почему — по убыванию числа задетых материалов.
 */
export function buildShortfallNotification(input: ShortfallInput): string {
  const causes = [...input.causes].sort((left, right) => right.count - left.count);
  const capacity = input.capacityExhausted;
  const missed = Math.max(input.plannedSlots - input.published, 0);

  const lines: string[] = [
    "<b>Конвейеру не хватило материала</b>",
    "",
    `<b>Период:</b> ${html(moscow(input.since))} — ${html(moscow(input.until))} МСК`,
    `<b>Слотов в плане:</b> ${input.plannedSlots}`,
    `<b>Вышло:</b> ${input.published}`,
    `<b>Не закрыто слотов:</b> ${missed}`,
  ];

  if (capacity.length > 0) {
    lines.push(
      "",
      `<b>Исчерпана ёмкость моделей:</b> ${html(capacity.join(", "))}`,
      "Пул провайдеров отказал целиком — материал не написан, а не забракован.",
    );
  }

  if (causes.length > 0) {
    lines.push("", "<b>Что помешало выпуску:</b>");
    for (const cause of causes) {
      lines.push(`• ${html(cause.platform)} — ${html(cause.reason)} (${cause.count})`);
    }
  }

  return lines.join("\n");
}

/**
 * Причина в том виде, в каком её поймёт владелец.
 *
 * Машинные формулировки из `last_error` («All AI providers failed for
 * marketing-agent-writer», «exceeds the 1000-character limit») в канале
 * бесполезны: они называют место в коде, а не то, что произошло с материалом.
 * Список закрытый — незнакомая причина уходит как есть, обрезанная, а не
 * подменяется догадкой.
 */
export function humanCause(raw: string | null): string {
  const text = (raw ?? "").trim();
  if (!text) return "причина не записана";
  if (/no free provider|all ai providers|ёмкости провайдеров/i.test(text)) {
    return "исчерпана ёмкость моделей";
  }
  if (/не устранен|неустранённ|неустраненн|предыдущего раунда|прошлого раунда/i.test(text)) {
    return "раунды редактуры не сошлись";
  }
  if (/exceeds the|лимит|длинн|символ/i.test(text)) return "превышен лимит площадки";
  if (/лог рассужд|не является фин|заглушку|think/i.test(text)) {
    return "автор прислал не пост";
  }
  if (/duplicate_topic/i.test(text)) return "тема уже выходила";
  if (/oauth|token|токен/i.test(text)) return "площадка не авторизована";
  if (/слот снят/i.test(text)) return "слот снят из плана";
  return text.length > 90 ? `${text.slice(0, 89)}…` : text;
}

/**
 * Сбор сводки за сутки из реестра публикаций.
 *
 * ⚠ ОКНО СЧИТАЕТСЯ ОТ ПЕРЕДАННОГО МОМЕНТА, а не от `now()` базы: на проде
 * `now()` отдаёт московское время, а колонки хранят наивный UTC, и фильтр «за
 * последние сутки» молча дал бы ноль строк.
 */
export async function collectConveyorShortfall(now: Date): Promise<ShortfallInput> {
  const since = new Date(now.getTime() - 24 * 60 * 60_000);
  const rows = await db.externalPublication.findMany({
    where: { updatedAt: { gte: since, lte: now } },
    select: { platform: true, status: true, lastError: true, archiveReason: true },
  }).catch(() => []);

  const published = rows.filter((row) => row.status === "PUBLISHED").length;
  const stalled = rows.filter((row) => row.status === "ARCHIVED" || row.status === "FAILED");

  const tally = new Map<string, ShortfallCause>();
  const capacity = new Set<string>();
  for (const row of stalled) {
    const platform = row.platform.trim().toLowerCase();
    const reason = humanCause(row.archiveReason ?? row.lastError);
    if (reason === "исчерпана ёмкость моделей") capacity.add(platform);
    const key = `${platform}|${reason}`;
    const seen = tally.get(key);
    if (seen) seen.count += 1;
    else tally.set(key, { platform, reason, count: 1 });
  }

  return {
    // Слоты, которые сутки должны были закрыть: вышедшее плюс вставшее.
    plannedSlots: published + stalled.length,
    published,
    causes: [...tally.values()],
    capacityExhausted: [...capacity],
    since,
    until: now,
  };
}

/**
 * Доставка сводки.
 *
 * ⚠ НИКОГДА НЕ БРОСАЕТ — по той же причине, что `notifyPublished`: сбой
 * доставки уведомления не имеет права выглядеть как отказ конвейера и тем
 * более его останавливать (B636, B694).
 */
export async function notifyShortfall(input: ShortfallInput): Promise<boolean> {
  if (!shortfallWorthReporting(input)) return false;

  let targets: string[] = [];
  try {
    targets = await marketingDeliveryTargets();
  } catch (error) {
    log.error("marketing.shortfall_notify_targets_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  const message = buildShortfallNotification(input);
  for (const chatId of targets) {
    try {
      await sendTelegram(chatId, message);
      return true;
    } catch (error) {
      log.warn("marketing.shortfall_notify_failed", {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  log.error("marketing.shortfall_notify_undelivered", { targets: targets.length });
  return false;
}
