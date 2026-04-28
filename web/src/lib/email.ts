import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "ETerapy <noreply@eterapy.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ─── Shared helpers ────────────────────────────────────────────────────────────

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
            ETerapy · Все услуги носят развлекательный и ознакомительный характер ·
            <a href="${APP_URL}" style="color:#C9A84C;text-decoration:none">eterapy.com</a>
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

// ─── Auth emails ──────────────────────────────────────────────────────────────

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/auth/verify-email?token=${token}`;
  return resend.emails.send({
    from: FROM, to: email,
    subject: "Подтвердите email — ETerapy",
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Подтвердите ваш email</h1>
      <p style="margin:0 0 8px;color:#94a3b8;line-height:1.6">Привет, ${name}!</p>
      <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Для завершения регистрации нажмите кнопку ниже. Ссылка действительна 24 часа.</p>
      ${btn(url, "Подтвердить email")}
      <p style="margin:24px 0 0;color:#475569;font-size:12px">Или скопируйте: <a href="${url}" style="color:#C9A84C">${url}</a></p>
    `),
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;
  return resend.emails.send({
    from: FROM, to: email,
    subject: "Сброс пароля — ETerapy",
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Сброс пароля</h1>
      <p style="margin:0 0 8px;color:#94a3b8;line-height:1.6">Привет, ${name}!</p>
      <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Мы получили запрос на сброс пароля. Ссылка действительна 1 час.</p>
      ${btn(url, "Сбросить пароль")}
      <p style="margin:24px 0 0;color:#475569;font-size:12px">Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
    `),
  });
}

// ─── Booking emails ───────────────────────────────────────────────────────────

interface BookingEmailData {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  practitionerName: string;
  practitionerEmail: string;
  practitionerId: string;
  slotStr: string;        // "пн, 7 апр, 14:00 – 15:00" or "время уточняется"
  priceRub: number;
  durationMin: number;
}

/** Клиенту: запрос принят, ждём подтверждения практика */
export async function sendBookingRequestedClient(d: BookingEmailData) {
  return resend.emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Запрос отправлен — ${d.practitionerName} · ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Запрос отправлен!</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${d.clientName}!</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(201,168,76,0.05);border:1px solid rgba(201,168,76,0.15);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Практик</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600;font-size:16px">${d.practitionerName}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Длительность · Стоимость</p>
          <p style="margin:0;color:#C9A84C;font-weight:700;font-size:18px">${d.durationMin} мин · ${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">
        Практик подтвердит запись в течение нескольких часов. Оплата производится после подтверждения.
      </p>
      ${btn(`${APP_URL}/cabinet/bookings`, "Мои записи")}
    `),
  });
}

/** Практику: новый запрос от клиента */
export async function sendBookingRequestedPractitioner(d: BookingEmailData) {
  return resend.emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Новый запрос от ${d.clientName} · ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Новый запрос на сессию</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">К вам хочет записаться <strong style="color:#f8fafc">${d.clientName}</strong>.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(201,168,76,0.05);border:1px solid rgba(201,168,76,0.15);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Длительность · Стоимость</p>
          <p style="margin:0;color:#C9A84C;font-weight:700;font-size:18px">${d.durationMin} мин · ${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">Подтвердите или отклоните запрос в вашем кабинете.</p>
      ${btn(`${APP_URL}/cabinet/practitioner/clients`, "Открыть кабинет")}
    `),
  });
}

/** Клиенту: практик подтвердил */
export async function sendBookingConfirmedClient(d: BookingEmailData) {
  return resend.emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Сессия подтверждена — ${d.practitionerName} · ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f8fafc">✅ Сессия подтверждена!</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${d.clientName}!</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Практик</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600;font-size:16px">${d.practitionerName}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Стоимость</p>
          <p style="margin:0;color:#C9A84C;font-weight:700;font-size:18px">${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">
        Ссылка на видеосессию станет доступна в вашей записи. Мы пришлём напоминание за 24 часа.
      </p>
      ${btn(`${APP_URL}/cabinet/bookings`, "Мои записи")}
    `),
  });
}

/** Практику: запись подтверждена (ссылка на видеочат) */
export async function sendBookingConfirmedPractitioner(d: BookingEmailData & { sessionUrl?: string }) {
  const sessionUrl = d.sessionUrl || `${APP_URL}/session/${d.bookingId}`;
  return resend.emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Запись подтверждена — ${d.clientName} · ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f8fafc">✅ Запись подтверждена!</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${d.practitionerName}!</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Клиент</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600;font-size:16px">${d.clientName}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:#f8fafc;font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Стоимость</p>
          <p style="margin:0;color:#C9A84C;font-weight:700;font-size:18px">${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Используйте ссылку ниже для подключения к видеосессии.</p>
      ${btn(sessionUrl, "Войти в видеочат")}
      <p style="margin:16px 0 0;color:#475569;font-size:12px">Ссылка также доступна в вашем кабинете в карточке записи.</p>
    `),
  });
}

/** Практику: напоминание за 24 часа */
export async function sendReminderPractitioner(d: BookingEmailData) {
  return resend.emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Напоминание: сессия завтра — ${d.clientName} · ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">⏰ Сессия завтра</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Напоминаем о предстоящей сессии с <strong style="color:#f8fafc">${d.clientName}</strong>.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(201,168,76,0.05);border:1px solid rgba(201,168,76,0.15);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Время</p>
          <p style="margin:0;color:#f8fafc;font-weight:600;font-size:16px">${d.slotStr}</p>
        </td></tr>
      </table>
      ${btn(`${APP_URL}/cabinet/practitioner/clients`, "Открыть кабинет")}
    `),
  });
}

/** Клиенту: напоминание за 24 часа */
export async function sendReminderClient(d: BookingEmailData) {
  return resend.emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Напоминание: сессия завтра — ${d.practitionerName} · ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">⏰ Сессия завтра</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${d.clientName}! Напоминаем о предстоящей сессии с <strong style="color:#f8fafc">${d.practitionerName}</strong>.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(201,168,76,0.05);border:1px solid rgba(201,168,76,0.15);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Время</p>
          <p style="margin:0;color:#f8fafc;font-weight:600;font-size:16px">${d.slotStr}</p>
        </td></tr>
      </table>
      ${btn(`${APP_URL}/cabinet/bookings`, "Мои записи")}
    `),
  });
}

/** Клиенту: сессия завершена — предложение оставить отзыв */
export async function sendReviewRequestClient(d: BookingEmailData) {
  return resend.emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Как прошла сессия с ${d.practitionerName}? · ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Как прошла сессия?</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${d.clientName}!</p>
      <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">
        Ваша сессия с <strong style="color:#f8fafc">${d.practitionerName}</strong> завершена.
        Оставьте отзыв — это помогает другим клиентам найти подходящего практика.
      </p>
      ${btn(`${APP_URL}/cabinet/bookings?review=${d.bookingId}`, "Оставить отзыв")}
      <p style="margin:24px 0 0;color:#475569;font-size:12px">Отзыв займёт меньше минуты. Спасибо!</p>
    `),
  });
}

/** Клиенту: запись отменена */
export async function sendBookingCancelledClient(d: BookingEmailData, cancelledBy: "client" | "practitioner") {
  return resend.emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Запись отменена — ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Запись отменена</h1>
      <p style="margin:0 0 16px;color:#94a3b8;line-height:1.6">Привет, ${d.clientName}!</p>
      <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">
        Запись к <strong style="color:#f8fafc">${d.practitionerName}</strong> (${d.slotStr}) была отменена
        ${cancelledBy === "practitioner" ? "практиком" : "вами"}.
        ${cancelledBy === "practitioner" ? "Мы сожалеем о неудобстве. Вы можете вернуться к вопросу и выбрать следующий шаг заново." : ""}
      </p>
      ${btn(`${APP_URL}/all-modalities/checkin`, "Задать новый вопрос")}
    `),
  });
}

/** Практику: запись отменена клиентом */
export async function sendBookingCancelledPractitioner(d: BookingEmailData) {
  return resend.emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Запись отменена клиентом — ETerapy`,
    html: emailWrapper(`
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f8fafc">Запись отменена</h1>
      <p style="margin:0 0 28px;color:#94a3b8;line-height:1.6">
        <strong style="color:#f8fafc">${d.clientName}</strong> отменил запись на ${d.slotStr}.
        Слот освобождён и снова доступен для бронирования.
      </p>
      ${btn(`${APP_URL}/cabinet/practitioner/schedule`, "Управление расписанием")}
    `),
  });
}

// ─── Legacy compat ────────────────────────────────────────────────────────────
/** @deprecated use sendBookingRequestedClient */
export async function sendBookingConfirmation(params: {
  clientEmail: string; clientName: string; practitionerName: string;
  practitionerId: string; slot: string; price: number;
}) {
  return sendBookingRequestedClient({
    bookingId: "",
    clientName: params.clientName,
    clientEmail: params.clientEmail,
    practitionerName: params.practitionerName,
    practitionerEmail: "",
    practitionerId: params.practitionerId,
    slotStr: params.slot,
    priceRub: params.price,
    durationMin: 60,
  });
}
