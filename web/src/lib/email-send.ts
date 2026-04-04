/**
 * Единая функция отправки email через шаблоны уведомлений.
 * Обёртка над src/lib/email.ts для системы уведомлений.
 */
import type { NotifEvent } from "@/lib/notifications";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";

interface EmailPayload {
  to: string;
  event: NotifEvent;
  name: string;
  data: Record<string, string>;
}

const SUBJECTS: Record<NotifEvent, string> = {
  BOOKING_REQUESTED:  "Новая запись — ответьте клиенту",
  BOOKING_CONFIRMED:  "Запись подтверждена",
  BOOKING_CANCELLED:  "Запись отменена",
  BOOKING_REMINDER:   "Напоминание о предстоящей сессии",
  SESSION_STARTED:    "Сессия началась",
  SESSION_COMPLETED:  "Сессия завершена",
  REVIEW_REQUESTED:   "Оставьте отзыв о сессии",
  NEW_REVIEW:         "Новый отзыв на вашем профиле",
  PAYMENT_RECEIVED:   "Платёж получен",
};

function buildHtml(event: NotifEvent, name: string, data: Record<string, string>): string {
  const subject = SUBJECTS[event];
  let body = "";

  switch (event) {
    case "BOOKING_REQUESTED":
      body = `<p>Клиент <strong>${data.clientName}</strong> хочет записаться на ${data.date} в ${data.time}.</p>
              <p><a href="${BASE_URL}/cabinet/practitioner/clients" style="color:#c9a96e">Перейти к записям →</a></p>`;
      break;
    case "BOOKING_CONFIRMED":
      body = `<p>Ваша сессия с <strong>${data.practitionerName}</strong> подтверждена на ${data.date} в ${data.time}.</p>
              <p><a href="${BASE_URL}/cabinet/bookings" style="color:#c9a96e">Перейти к записям →</a></p>`;
      break;
    case "BOOKING_CANCELLED":
      body = `<p>Сессия на ${data.date} отменена${data.reason ? `: ${data.reason}` : ""}.</p>`;
      break;
    case "BOOKING_REMINDER":
      body = `<p>Напоминаем: ваша сессия ${data.withName ? `с ${data.withName} ` : ""}начнётся ${data.in}.</p>
              <p><a href="${BASE_URL}/session/${data.bookingId}" style="color:#c9a96e">Открыть видеочат →</a></p>`;
      break;
    case "SESSION_COMPLETED":
      body = `<p>Сессия завершена. ${data.reviewUrl ? `<a href="${data.reviewUrl}" style="color:#c9a96e">Оставить отзыв →</a>` : ""}</p>`;
      break;
    case "REVIEW_REQUESTED":
      body = `<p>Как прошла сессия с ${data.practitionerName}?</p>
              <p><a href="${data.reviewUrl}" style="color:#c9a96e">Написать отзыв →</a></p>`;
      break;
    case "NEW_REVIEW":
      body = `<p>Клиент <strong>${data.clientName}</strong> оставил отзыв ${data.rating}/5.</p>
              ${data.text ? `<blockquote style="border-left:3px solid #c9a96e;padding-left:12px;color:#aaa">${data.text}</blockquote>` : ""}`;
      break;
    case "PAYMENT_RECEIVED":
      body = `<p>Получена оплата <strong>${data.amountRub} ₽</strong> за сессию ${data.date}.</p>`;
      break;
    default:
      body = `<p>У вас новое уведомление от ETerapy.</p>`;
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:sans-serif;background:#0e1628;color:#e8e0d4;max-width:520px;margin:0 auto;padding:32px 24px">
  <h2 style="color:#c9a96e;font-size:20px;margin-bottom:8px">ETerapy</h2>
  <h3 style="margin-top:0;font-size:16px">${subject}</h3>
  <p style="color:#c0b8b0">Здравствуйте, ${name}!</p>
  ${body}
  <hr style="border-color:#2a3448;margin:24px 0">
  <p style="font-size:12px;color:#666">
    Вы получили это письмо, потому что у вас есть аккаунт на <a href="${BASE_URL}" style="color:#c9a96e">ETerapy</a>.
    <br>Управлять уведомлениями: <a href="${BASE_URL}/cabinet/settings#notifications" style="color:#c9a96e">настройки уведомлений</a>.
  </p>
</body>
</html>`;
}

export async function sendEmail({ to, event, name, data }: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY not set, skipping notification email");
    return;
  }

  const html = buildHtml(event, name, data);
  const subject = SUBJECTS[event];

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "ETerapy <noreply@eterapy.com>",
      to,
      subject,
      html,
    }),
  });
}
