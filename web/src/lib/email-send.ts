/**
 * Единая функция отправки email для системы уведомлений (notify).
 * Использует тот же emailWrapper что и lib/email.ts — единый стиль.
 */
import type { NotifEvent } from "@/lib/notification-events";
import { log } from "@/lib/logger";
import { EMAIL_FROM as FROM } from "@/lib/env";
import {
  EMAIL_BORDEAUX as BORDEAUX,
  EMAIL_INK_SOFT as INK_SOFT,
  EMAIL_TERRACOTTA as TERRACOTTA,
  emailButton as button,
  emailHeading as heading,
  emailInfoBox as box,
  emailRow as rowOf,
  emailWrapper as wrapper,
} from "@/lib/email-theme";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Оформление — общий модуль `email-theme.ts` (B592).
const emailWrapper = (body: string) => wrapper(body, {
  footer: `Вы получили это письмо как пользователь <a href="${BASE_URL}" style="color:${TERRACOTTA};text-decoration:none">ETerapy</a>.
    Управлять уведомлениями: <a href="${BASE_URL}/cabinet/settings#notifications" style="color:${TERRACOTTA};text-decoration:none">настройки</a>.`,
});
const btn = button;
const infoBox = box;
const row = rowOf;

const SUBJECTS: Record<NotifEvent, string> = {
  BOOKING_REQUESTED:  "Новый запрос на сессию — ETerapy",
  BOOKING_CONFIRMED:  "Сессия подтверждена — ETerapy",
  BOOKING_CANCELLED:  "Запись отменена — ETerapy",
  BOOKING_REMINDER:   "Напоминание о сессии — ETerapy",
  SESSION_STARTED:    "Сессия началась — ETerapy",
  SESSION_COMPLETED:  "Сессия завершена — ETerapy",
  REVIEW_REQUESTED:   "Оставьте отзыв — ETerapy",
  NEW_REVIEW:         "Новый отзыв на вашем профиле — ETerapy",
  PAYMENT_RECEIVED:   "Платёж получен — ETerapy",
  PAYOUT_SCHEDULED:   "Запланированная выплата — ETerapy",
  BALANCE_TOPUP:      "Баланс пополнен — ETerapy",
  PRODUCT_UNLOCKED:   "Продукт открыт — ETerapy",
  SUBSCRIPTION_STARTED: "Подписка активна — ETerapy",
  SUBSCRIPTION_RENEWAL: "Скоро автопродление подписки — ETerapy",
  SUBSCRIPTION_CANCELLED: "Подписка отменена — ETerapy",
  SUBSCRIPTION_PAYMENT_FAILED: "Платёж подписки не прошёл — ETerapy",
  CARD_LINKED:        "Карта привязана — ETerapy",
  CARD_REMOVED:       "Карта отвязана — ETerapy",
  DAILY_CARD:         "Карта дня — ETerapy",
  ABANDONED_CHECKOUT: "Вы остановились перед оплатой — ETerapy",
  REPORT_READY:       "Ваш отчет готов — ETerapy",
  PARTNER_COMPLETED:  "Партнер завершил свою часть — ETerapy",
  CIRCLE_READY:       "Круг готов — ETerapy",
  ROUTE_REMINDER:     "Мягкое напоминание — ETerapy",
  WEEKLY_DIGEST:      "Ваш недельный дайджест — ETerapy",
  PRACTITIONER_DIGEST: "Дайджест специалиста — ETerapy",
  COMPLIANCE_ALERT:   "Комплаенс-сигнал — ETerapy",
  CREDITS_EXPIRING:   "Баллы скоро сгорят — ETerapy",
  STREAK_AT_RISK:     "Можно сохранить ритм — ETerapy",
  MOMENT_OF_NEED:     "Можно вернуться к своей теме — ETerapy",
  WELCOME_CREDITS:    "Приветственные баллы начислены — ETerapy",
  WELCOME_CREDITS_REMINDER: "Приветственные баллы ждут — ETerapy",
  // B466 practitioner platform
  BOOKING_PROPOSED:         "Специалист предложил время сессии — ETerapy",
  BOOKING_CHANGE_REQUESTED: "Запрос переноса или отмены сессии — ETerapy",
  BOOKING_CHANGE_RESOLVED:  "Решение по переносу/отмене — ETerapy",
  PRACTITIONER_MESSAGE:     "Сообщение от вашего специалиста — ETerapy",
  // B484 practitioner reliability policy
  GOODWILL_CREDITS:         "Компенсация баллами — ETerapy",
  RELIABILITY_WARNING:      "Предупреждение о надёжности — ETerapy",
};

function buildBody(event: NotifEvent, name: string, data: Record<string, string>): string {
  const greeting = `<p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Привет, <strong style="color:${BORDEAUX}">${name}</strong>!</p>`;

  switch (event) {
    case "BOOKING_REQUESTED":
      return `
        ${heading("Новый запрос на сессию")}
        ${greeting}
        ${infoBox(row("Клиент", data.clientName) + row("Дата", data.date) + row("Время", data.time).replace("margin:0 0 16px", "margin:0"))}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Подтвердите или отклоните запрос в вашем кабинете.</p>
        ${btn(`${BASE_URL}/cabinet/practitioner/clients`, "Открыть кабинет")}
      `;
    case "BOOKING_CONFIRMED":
      return `
        ${heading("✅ Сессия подтверждена!")}
        ${greeting}
        ${infoBox(
          row("Практик", data.practitionerName) +
          row("Дата", data.date) +
          row("Время", data.time).replace("margin:0 0 16px", "margin:0"))}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Мы пришлём напоминание за 24 часа.</p>
        ${data.sessionUrl ? btn(data.sessionUrl, "Войти в видеочат") : btn(`${BASE_URL}/cabinet/bookings`, "Мои записи")}
      `;
    case "BOOKING_CANCELLED":
      return `
        ${heading("Запись отменена")}
        ${greeting}
        ${infoBox(row("Дата", data.date) + row("Время", data.time).replace("margin:0 0 16px", "margin:0"))}
        ${data.reason ? `<p style="margin:0 0 28px;color:${INK_SOFT}">Причина: ${data.reason}</p>` : ""}
        ${btn(`${BASE_URL}/checkin`, "Задать новый вопрос")}
      `;
    case "BOOKING_REMINDER":
      return `
        ${heading("⏰ Напоминание о сессии")}
        ${greeting}
        ${infoBox(
          (data.withName ? row("С", data.withName) : "") +
          row("Дата", data.date) +
          row("Время", data.time).replace("margin:0 0 16px", "margin:0")
        )}
        <p style="margin:0 0 28px;color:${INK_SOFT}">Сессия начнётся через <strong style="color:${BORDEAUX}">${data.in}</strong>.</p>
        ${data.sessionUrl ? btn(data.sessionUrl, "Открыть видеочат") : btn(`${BASE_URL}/session/${data.bookingId}`, "Открыть видеочат")}
      `;
    case "SESSION_STARTED":
      return `
        ${heading("🎥 Сессия началась")}
        ${greeting}
        <p style="margin:0 0 28px;color:${INK_SOFT}">Ваша сессия уже началась. Присоединяйтесь!</p>
        ${btn(`${BASE_URL}/session/${data.bookingId}`, "Войти в видеочат")}
      `;
    case "SESSION_COMPLETED":
      return `
        ${heading("Сессия завершена")}
        ${greeting}
        <p style="margin:0 0 28px;color:${INK_SOFT}">Надеемся, сессия прошла продуктивно!
        ${data.reviewUrl ? "Оставьте отзыв — это помогает другим клиентам." : ""}</p>
        ${data.reviewUrl ? btn(data.reviewUrl, "Оставить отзыв") : ""}
      `;
    case "REVIEW_REQUESTED":
      return `
        ${heading("Как прошла сессия?")}
        ${greeting}
        <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Ваша сессия с <strong style="color:${BORDEAUX}">${data.practitionerName}</strong> завершена.</p>
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Оставьте отзыв — это занимает меньше минуты и помогает другим клиентам.</p>
        ${btn(data.reviewUrl, "Оставить отзыв")}
      `;
    case "NEW_REVIEW":
      return `
        ${heading("⭐ Новый отзыв")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${TERRACOTTA};font-size:20px">${"★".repeat(parseInt(data.rating || "5"))}</p>
           <p style="margin:0;color:${BORDEAUX};font-style:italic">"${data.text}"</p>
           <p style="margin:8px 0 0;color:${INK_SOFT};font-size:12px">— ${data.clientName}</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/practitioner/reviews`, "Все отзывы")}
      `;
    case "PAYMENT_RECEIVED":
      return `
        ${heading("💰 Платёж получен")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Сумма</p>
           <p style="margin:0 0 16px;color:${TERRACOTTA};font-weight:700;font-size:22px">${data.amountRub} ₽</p>
           <p style="margin:0 0 4px;color:${INK_SOFT};font-size:12px">Дата</p>
           <p style="margin:0;color:${BORDEAUX}">${data.date}</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/practitioner/earnings`, "Мои доходы")}
      `;
    case "BALANCE_TOPUP":
      return `
        ${heading("💳 Баланс пополнен")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Сумма пополнения</p>
           <p style="margin:0;color:${TERRACOTTA};font-weight:700;font-size:22px">+${data.amountRub} ₽</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть кошелёк")}
      `;
    case "PRODUCT_UNLOCKED":
      return `
        ${heading("Продукт открыт")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Доступ</p>
           <p style="margin:0;color:${TERRACOTTA};font-weight:700;font-size:18px">${data.productKey}</p>`
        )}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Результат уже доступен в вашем кабинете. Если страница была открыта во время оплаты, обновите её.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть доступы")}
      `;
    case "SUBSCRIPTION_STARTED":
      return `
        ${heading("Подписка активна")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Тариф</p>
           <p style="margin:0;color:${TERRACOTTA};font-weight:700;font-size:18px">${data.planKey}</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/billing`, "Управлять подпиской")}
      `;
    case "SUBSCRIPTION_CANCELLED":
      return `
        ${heading("Подписка отменена")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Тариф</p>
           <p style="margin:0;color:${BORDEAUX};font-weight:600;font-size:18px">${data.planKey}</p>`)}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Доступ сохранится до конца оплаченного периода, если он указан в кабинете.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть биллинг")}
      `;
    case "SUBSCRIPTION_PAYMENT_FAILED":
      return `
        ${heading("Платёж подписки не прошёл")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Тариф</p>
           <p style="margin:0;color:${BORDEAUX};font-weight:600;font-size:18px">${data.planKey}</p>`)}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Проверьте способ оплаты, чтобы доступ не прервался.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Проверить оплату")}
      `;
    case "CARD_LINKED":
      return `
        ${heading("🔗 Карта привязана")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Новая карта</p>
           <p style="margin:0;color:${BORDEAUX};font-weight:600;font-size:18px">${data.brand} •••• ${data.last4}</p>`
        )}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Теперь вы можете быстро пополнять баланс этой картой.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Мои карты")}
      `;
    case "CARD_REMOVED":
      return `
        ${heading("🗑 Карта отвязана")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Удалённая карта</p>
           <p style="margin:0;color:${BORDEAUX};font-weight:600;font-size:18px">${data.brand} •••• ${data.last4}</p>`)}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Если вы не совершали это действие — свяжитесь с поддержкой.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть кошелёк")}
      `;
    case "DAILY_CARD":
      return `
        ${heading("Карта дня")}
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Сегодняшний фокус</p>
           <p style="margin:0;color:${BORDEAUX};font-weight:600;font-size:18px">${data.title}</p>`
        )}
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.body}</p>
        ${btn(`${BASE_URL}/cabinet`, "Открыть кабинет")}
      `;
    case "ABANDONED_CHECKOUT":
      return `${greeting}${heading("Оплату можно спокойно завершить")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.productName ?? "Выбранный продукт"} останется доступен после оплаты.</p>${btn(data.checkoutUrl ?? `${BASE_URL}/pricing`, "Вернуться к оплате")}`;
    case "REPORT_READY":
      return `${greeting}${heading("Отчет готов")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.title ?? "Ваш разбор"} можно открыть в кабинете.</p>${btn(data.reportUrl ?? `${BASE_URL}/cabinet/diary`, "Открыть отчет")}`;
    case "PARTNER_COMPLETED":
      return `${greeting}${heading("Вторая часть готова")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Партнер завершил свою часть. Можно открыть результат и продолжить к общему отчету.</p>${btn(data.reportUrl ?? `${BASE_URL}/pair`, "Открыть")}`;
    case "CIRCLE_READY":
      return `${greeting}${heading("Круг собран")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Ответов уже достаточно, чтобы собрать общий мягкий вывод.</p>${btn(data.circleUrl ?? `${BASE_URL}/circle`, "Открыть круг")}`;
    case "ROUTE_REMINDER":
      return `${greeting}${heading("Можно вернуться к маршруту")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.body ?? "Один маленький шаг сегодня будет достаточно."}</p>${btn(data.routeUrl ?? `${BASE_URL}/cabinet`, "Продолжить")}`;
    case "WEEKLY_DIGEST":
      return `${greeting}${heading("Недельный дайджест")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.summary ?? "Ваши вопросы и практики собраны в мягкую сводку."}</p>${btn(data.digestUrl ?? `${BASE_URL}/cabinet`, "Открыть")}`;
    case "PRACTITIONER_DIGEST":
      return `${greeting}${heading("Дайджест кабинета")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.summary ?? "Заявки, встречи, выплаты и отзывы за период."}</p>${btn(data.digestUrl ?? `${BASE_URL}/cabinet/practitioner`, "Открыть кабинет")}`;
    case "COMPLIANCE_ALERT":
      return `${greeting}${heading("Комплаенс-сигнал")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.summary ?? "Нужна проверка модератором."}</p>${btn(data.reviewUrl ?? `${BASE_URL}/admin/product/quality`, "Открыть проверку")}`;
    case "CREDITS_EXPIRING":
      return `${greeting}${heading("Баллы скоро сгорят")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">У вас есть ${data.credits ?? "несколько"} баллов, которые закончатся примерно через ${data.days ?? "пару"} дн. Можно потратить их на один небольшой разбор без спешки.</p>${btn(data.walletUrl ?? `${BASE_URL}/cabinet/wallet`, "Открыть кошелёк")}`;
    case "STREAK_AT_RISK":
      return `${greeting}${heading("Один короткий шаг сохранит ритм")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Вчера у вас был ритм практики ${data.streak ?? "несколько"} дн. Если сегодня есть силы, можно сделать только один маленький шаг.</p>${btn(data.practiceUrl ?? `${BASE_URL}/cabinet/diary`, "Открыть практику")}`;
    case "MOMENT_OF_NEED":
      return `${greeting}${heading("Можно вернуться к своей теме")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.topic ? `Тема "${data.topic}"` : "Ваша сохраненная тема"} все еще доступна в карте. Можно продолжить с одного вопроса.</p>${btn(data.mapUrl ?? `${BASE_URL}/cabinet/diary`, "Открыть карту")}`;
    case "WELCOME_CREDITS":
      return `${greeting}${heading("Приветственные баллы начислены")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.credits ?? "3"} балла уже в кошельке. Они помогут попробовать первый небольшой формат.</p>${btn(data.walletUrl ?? `${BASE_URL}/cabinet/wallet`, "Открыть кошелёк")}`;
    case "WELCOME_CREDITS_REMINDER":
      return `${greeting}${heading("Приветственные баллы ждут")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Если хотите попробовать первый разбор, приветственные баллы еще доступны.</p>${btn(data.walletUrl ?? `${BASE_URL}/cabinet/wallet`, "Открыть кошелёк")}`;
    // B466 practitioner platform
    case "BOOKING_PROPOSED":
      return `${greeting}${heading("Специалист предложил время сессии")}${infoBox(row("Специалист", data.practitionerName ?? "—") + row("Дата", data.date ?? "—") + row("Время", data.time ?? "—").replace("margin:0 0 16px", "margin:0"))}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Подтвердите предложение и оплатите сессию — или отклоните, если время не подходит.</p>${btn(`${BASE_URL}/cabinet/bookings`, "Открыть записи")}`;
    case "BOOKING_CHANGE_REQUESTED":
      return `${greeting}${heading(data.type === "CANCEL" ? "Запрос на отмену сессии" : "Запрос на перенос сессии")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.byName ?? "Другая сторона"} просит ${data.type === "CANCEL" ? "отменить" : "перенести"} сессию ${data.date ?? ""} в ${data.time ?? ""}${data.proposed ? ` на ${data.proposed}` : ""}. Ответьте в кабинете.</p>${btn(`${BASE_URL}${data.href ?? "/cabinet/bookings"}`, "Ответить")}`;
    case "BOOKING_CHANGE_RESOLVED":
      return `${greeting}${heading(data.approved === "1" ? (data.type === "CANCEL" ? "Отмена согласована" : "Перенос согласован") : (data.type === "CANCEL" ? "В отмене отказано" : "В переносе отказано"))}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Сессия ${data.date ?? ""} в ${data.time ?? ""}${data.proposed ? ` → ${data.proposed}` : ""}.</p>${btn(`${BASE_URL}${data.href ?? "/cabinet/bookings"}`, "Открыть записи")}`;
    case "PRACTITIONER_MESSAGE":
      return `${greeting}${heading("Сообщение от вашего специалиста")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${data.practitionerName ?? "Специалист"} отправил вам материал к сессии.${data.preview ? ` «${data.preview}»` : ""}</p>${btn(`${BASE_URL}${data.href ?? "/cabinet/messages"}`, "Прочитать")}`;
    case "GOODWILL_CREDITS":
      return `${greeting}${heading("Компенсация баллами")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Мы начислили вам +${data.amount ?? ""} балл(ов). ${data.reason ?? ""}</p>${btn(`${BASE_URL}/cabinet/wallet`, "Открыть кошелёк")}`;
    case "RELIABILITY_WARNING":
      return `${greeting}${heading("Предупреждение о надёжности")}<p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">За последние 30 дней: поздних отмен — ${data.lateCancels ?? "0"}, подтверждённых неявок — ${data.noShows ?? "0"}. Профиль временно показывается ниже в каталоге; повторные случаи ведут к ручному ревью доступа.</p>${btn(`${BASE_URL}/cabinet/practitioner/calendar`, "Открыть календарь")}`;
    default:
      return `<p style="color:${INK_SOFT}">Уведомление от ETerapy.</p>`;
  }
}

interface EmailPayload {
  to: string;
  event: NotifEvent;
  name: string;
  data: Record<string, string>;
}

export async function sendEmail({ to, event, name, data }: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("email.resend_api_key_missing");
    return;
  }

  const html = emailWrapper(buildBody(event, name, data));
  const subject = SUBJECTS[event];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error("email.resend_failed", { err });
  }
}
