/**
 * Единая функция отправки email для системы уведомлений (notify).
 * Использует тот же emailWrapper что и lib/email.ts — единый стиль.
 */
import type { NotifEvent } from "@/lib/notification-events";
import { log } from "@/lib/logger";
import { EMAIL_FROM as FROM } from "@/lib/env";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Единый шаблон — тот же стиль что в lib/email.ts
function emailWrapper(body: string) {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1B2A;font-family:Inter,Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0f2236;border-radius:12px;border:1px solid rgba(201,168,76,0.2);padding:40px;max-width:560px">
        <tr><td>
          <p style="margin:0 0 24px;color:#C9A84C;font-size:20px;font-weight:700;letter-spacing:-0.3px">✦ ETerapy</p>
          ${body}
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0 24px">
          <p style="margin:0;color:#475569;font-size:11px;line-height:1.6">
            Вы получили это письмо как пользователь <a href="${BASE_URL}" style="color:#C9A84C;text-decoration:none">ETerapy</a>.
            Управлять уведомлениями: <a href="${BASE_URL}/cabinet/settings#notifications" style="color:#C9A84C;text-decoration:none">настройки</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#C9A84C;color:#0D1B2A;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${label}</a>`;
}

function infoBox(content: string, accent = "rgba(201,168,76,0.15)") {
  return `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(201,168,76,0.05);border:1px solid ${accent};border-radius:8px;padding:20px;width:100%">
    <tr><td>${content}</td></tr>
  </table>`;
}

function row(label: string, value: string) {
  return `<p style="margin:0 0 4px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">${label}</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600">${value}</p>`;
}

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
  SUBSCRIPTION_CANCELLED: "Подписка отменена — ETerapy",
  SUBSCRIPTION_PAYMENT_FAILED: "Платёж подписки не прошёл — ETerapy",
  CARD_LINKED:        "Карта привязана — ETerapy",
  CARD_REMOVED:       "Карта отвязана — ETerapy",
  DAILY_CARD:         "Карта дня — ETerapy",
  ABANDONED_CHECKOUT: "Вы остановились перед оплатой — ETerapy",
  REPORT_READY:       "Ваш отчет готов — ETerapy",
  PARTNER_COMPLETED:  "Партнер завершил свою часть — ETerapy",
  CIRCLE_READY:       "Круг ясности готов — ETerapy",
  ROUTE_REMINDER:     "Мягкое напоминание — ETerapy",
  WEEKLY_DIGEST:      "Ваш недельный дайджест — ETerapy",
  PRACTITIONER_DIGEST: "Дайджест специалиста — ETerapy",
  COMPLIANCE_ALERT:   "Комплаенс-сигнал — ETerapy",
};

function buildBody(event: NotifEvent, name: string, data: Record<string, string>): string {
  const greeting = `<p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, <strong style="color:#f8fafc">${name}</strong>!</p>`;

  switch (event) {
    case "BOOKING_REQUESTED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Новый запрос на сессию</h1>
        ${greeting}
        ${infoBox(row("Клиент", data.clientName) + row("Дата", data.date) + row("Время", data.time).replace("margin:0 0 16px", "margin:0"))}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Подтвердите или отклоните запрос в вашем кабинете.</p>
        ${btn(`${BASE_URL}/cabinet/practitioner/clients`, "Открыть кабинет")}
      `;
    case "BOOKING_CONFIRMED":
      return `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f8fafc">✅ Сессия подтверждена!</h1>
        ${greeting}
        ${infoBox(
          row("Практик", data.practitionerName) +
          row("Дата", data.date) +
          row("Время", data.time).replace("margin:0 0 16px", "margin:0"),
          "rgba(34,197,94,0.2)"
        )}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Мы пришлём напоминание за 24 часа.</p>
        ${data.sessionUrl ? btn(data.sessionUrl, "Войти в видеочат") : btn(`${BASE_URL}/cabinet/bookings`, "Мои записи")}
      `;
    case "BOOKING_CANCELLED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Запись отменена</h1>
        ${greeting}
        ${infoBox(row("Дата", data.date) + row("Время", data.time).replace("margin:0 0 16px", "margin:0"), "rgba(239,68,68,0.2)")}
        ${data.reason ? `<p style="margin:0 0 28px;color:#94a3b8">Причина: ${data.reason}</p>` : ""}
        ${btn(`${BASE_URL}/checkin`, "Задать новый вопрос")}
      `;
    case "BOOKING_REMINDER":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">⏰ Напоминание о сессии</h1>
        ${greeting}
        ${infoBox(
          (data.withName ? row("С", data.withName) : "") +
          row("Дата", data.date) +
          row("Время", data.time).replace("margin:0 0 16px", "margin:0")
        )}
        <p style="margin:0 0 28px;color:#94a3b8">Сессия начнётся через <strong style="color:#f8fafc">${data.in}</strong>.</p>
        ${data.sessionUrl ? btn(data.sessionUrl, "Открыть видеочат") : btn(`${BASE_URL}/session/${data.bookingId}`, "Открыть видеочат")}
      `;
    case "SESSION_STARTED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">🎥 Сессия началась</h1>
        ${greeting}
        <p style="margin:0 0 28px;color:#94a3b8">Ваша сессия уже началась. Присоединяйтесь!</p>
        ${btn(`${BASE_URL}/session/${data.bookingId}`, "Войти в видеочат")}
      `;
    case "SESSION_COMPLETED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Сессия завершена</h1>
        ${greeting}
        <p style="margin:0 0 28px;color:#94a3b8">Надеемся, сессия прошла продуктивно!
        ${data.reviewUrl ? "Оставьте отзыв — это помогает другим клиентам." : ""}</p>
        ${data.reviewUrl ? btn(data.reviewUrl, "Оставить отзыв") : ""}
      `;
    case "REVIEW_REQUESTED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Как прошла сессия?</h1>
        ${greeting}
        <p style="margin:0 0 8px;color:#94a3b8;line-height:1.6">Ваша сессия с <strong style="color:#f8fafc">${data.practitionerName}</strong> завершена.</p>
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Оставьте отзыв — это занимает меньше минуты и помогает другим клиентам.</p>
        ${btn(data.reviewUrl, "Оставить отзыв")}
      `;
    case "NEW_REVIEW":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">⭐ Новый отзыв</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#C9A84C;font-size:20px">${"★".repeat(parseInt(data.rating || "5"))}</p>
           <p style="margin:0;color:#f8fafc;font-style:italic">"${data.text}"</p>
           <p style="margin:8px 0 0;color:#94a3b8;font-size:12px">— ${data.clientName}</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/practitioner/reviews`, "Все отзывы")}
      `;
    case "PAYMENT_RECEIVED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">💰 Платёж получен</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Сумма</p>
           <p style="margin:0 0 16px;color:#C9A84C;font-weight:700;font-size:22px">${data.amountRub} ₽</p>
           <p style="margin:0 0 4px;color:#94a3b8;font-size:12px">Дата</p>
           <p style="margin:0;color:#f8fafc">${data.date}</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/practitioner/earnings`, "Мои доходы")}
      `;
    case "BALANCE_TOPUP":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">💳 Баланс пополнен</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Сумма пополнения</p>
           <p style="margin:0;color:#C9A84C;font-weight:700;font-size:22px">+${data.amountRub} ₽</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть кошелёк")}
      `;
    case "PRODUCT_UNLOCKED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Продукт открыт</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Доступ</p>
           <p style="margin:0;color:#C9A84C;font-weight:700;font-size:18px">${data.productKey}</p>`
        )}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Результат уже доступен в вашем кабинете. Если страница была открыта во время оплаты, обновите её.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть доступы")}
      `;
    case "SUBSCRIPTION_STARTED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Подписка активна</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Тариф</p>
           <p style="margin:0;color:#C9A84C;font-weight:700;font-size:18px">${data.planKey}</p>`
        )}
        ${btn(`${BASE_URL}/cabinet/billing`, "Управлять подпиской")}
      `;
    case "SUBSCRIPTION_CANCELLED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Подписка отменена</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Тариф</p>
           <p style="margin:0;color:#f8fafc;font-weight:600;font-size:18px">${data.planKey}</p>`,
          "rgba(245,158,11,0.2)"
        )}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Доступ сохранится до конца оплаченного периода, если он указан в кабинете.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть биллинг")}
      `;
    case "SUBSCRIPTION_PAYMENT_FAILED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Платёж подписки не прошёл</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Тариф</p>
           <p style="margin:0;color:#f8fafc;font-weight:600;font-size:18px">${data.planKey}</p>`,
          "rgba(239,68,68,0.2)"
        )}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Проверьте способ оплаты, чтобы доступ не прервался.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Проверить оплату")}
      `;
    case "CARD_LINKED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">🔗 Карта привязана</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Новая карта</p>
           <p style="margin:0;color:#f8fafc;font-weight:600;font-size:18px">${data.brand} •••• ${data.last4}</p>`
        )}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Теперь вы можете быстро пополнять баланс этой картой.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Мои карты")}
      `;
    case "CARD_REMOVED":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">🗑 Карта отвязана</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Удалённая карта</p>
           <p style="margin:0;color:#f8fafc;font-weight:600;font-size:18px">${data.brand} •••• ${data.last4}</p>`,
          "rgba(239,68,68,0.2)"
        )}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Если вы не совершали это действие — свяжитесь с поддержкой.</p>
        ${btn(`${BASE_URL}/cabinet/billing`, "Открыть кошелёк")}
      `;
    case "DAILY_CARD":
      return `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Карта дня</h1>
        ${greeting}
        ${infoBox(
          `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Сегодняшний фокус</p>
           <p style="margin:0;color:#f8fafc;font-weight:600;font-size:18px">${data.title}</p>`
        )}
        <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">${data.body}</p>
        ${btn(`${BASE_URL}/cabinet`, "Открыть кабинет")}
      `;
    case "ABANDONED_CHECKOUT":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Оплату можно спокойно завершить</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">${data.productName ?? "Выбранный продукт"} останется доступен после оплаты.</p>${btn(data.checkoutUrl ?? `${BASE_URL}/pricing`, "Вернуться к оплате")}`;
    case "REPORT_READY":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Отчет готов</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">${data.title ?? "Ваш разбор"} можно открыть в кабинете.</p>${btn(data.reportUrl ?? `${BASE_URL}/cabinet/action-history`, "Открыть отчет")}`;
    case "PARTNER_COMPLETED":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Вторая часть готова</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Партнер завершил свою часть. Можно открыть результат и продолжить к общему отчету.</p>${btn(data.reportUrl ?? `${BASE_URL}/pair`, "Открыть")}`;
    case "CIRCLE_READY":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Круг ясности собран</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Ответов уже достаточно, чтобы собрать общий мягкий вывод.</p>${btn(data.circleUrl ?? `${BASE_URL}/circle`, "Открыть круг")}`;
    case "ROUTE_REMINDER":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Можно вернуться к маршруту</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">${data.body ?? "Один маленький шаг сегодня будет достаточно."}</p>${btn(data.routeUrl ?? `${BASE_URL}/cabinet`, "Продолжить")}`;
    case "WEEKLY_DIGEST":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Недельный дайджест</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">${data.summary ?? "Ваши вопросы и практики собраны в мягкую сводку."}</p>${btn(data.digestUrl ?? `${BASE_URL}/cabinet`, "Открыть")}`;
    case "PRACTITIONER_DIGEST":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Дайджест кабинета</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">${data.summary ?? "Заявки, встречи, выплаты и отзывы за период."}</p>${btn(data.digestUrl ?? `${BASE_URL}/cabinet/practitioner`, "Открыть кабинет")}`;
    case "COMPLIANCE_ALERT":
      return `${greeting}<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Комплаенс-сигнал</h1><p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">${data.summary ?? "Нужна проверка модератором."}</p>${btn(data.reviewUrl ?? `${BASE_URL}/admin/complaints`, "Открыть проверку")}`;
    default:
      return `<p style="color:#94a3b8">Уведомление от ETerapy.</p>`;
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
