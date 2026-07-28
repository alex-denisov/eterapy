import { Resend } from "resend";
import { EMAIL_FROM as FROM } from "@/lib/env";
import { withAccountEmailLog } from "@/lib/notifications/dispatch-log";
import {
  EMAIL_BORDEAUX as BORDEAUX,
  EMAIL_INK_FAINT as INK_FAINT,
  EMAIL_INK_SOFT as INK_SOFT,
  EMAIL_PAPER_EDGE as PAPER_EDGE,
  EMAIL_TERRACOTTA as TERRACOTTA,
  emailButton as button,
  emailHeading as heading,
  emailWrapper as wrapper,
} from "@/lib/email-theme";

let resendClient: Resend | null = null;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  resendClient ??= new Resend(apiKey);
  return resendClient;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

// Оформление вынесено в `email-theme.ts` — им пользуются и транзакционные
// письма отсюда, и уведомления (`email-send.ts`), и маркетинговые рассылки.
const emailWrapper = wrapper;
const btn = button;
const h1 = heading;

// ─── Auth emails ──────────────────────────────────────────────────────────────

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/auth/verify-email?token=${token}`;
  return withAccountEmailLog(
    { recipient: email, event: "ACCOUNT_EMAIL_VERIFY", subject: "Подтвердите email — ETerapy" },
    () => getResendClient().emails.send({
    from: FROM, to: email,
    subject: "Подтвердите email — ETerapy",
    html: emailWrapper(`
      ${h1("Подтвердите ваш email")}
      <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Привет, ${name}!</p>
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Для завершения регистрации нажмите кнопку ниже. Ссылка действительна 24 часа.</p>
      ${btn(url, "Подтвердить email")}
      <p style="margin:24px 0 0;color:${INK_FAINT};font-size:12px">Или скопируйте: <a href="${url}" style="color:${TERRACOTTA}">${url}</a></p>
    `),
    }),
  );
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;
  return withAccountEmailLog(
    { recipient: email, event: "ACCOUNT_PASSWORD_RESET", subject: "Сброс пароля — ETerapy" },
    () => getResendClient().emails.send({
    from: FROM, to: email,
    subject: "Сброс пароля — ETerapy",
    html: emailWrapper(`
      ${h1("Сброс пароля")}
      <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Привет, ${name}!</p>
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Мы получили запрос на сброс пароля. Ссылка действительна 1 час.</p>
      ${btn(url, "Сбросить пароль")}
      <p style="margin:24px 0 0;color:${INK_FAINT};font-size:12px">Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
    `),
    }),
  );
}

/**
 * Invitation to an account created by an administrator. This is intentionally
 * separate from password reset: the recipient did not request a reset.
 */
export async function sendAccountInvitationEmail(
  email: string,
  name: string,
  token: string,
  role: "client" | "practitioner" | "moderator",
) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;
  const roleLabel = role === "moderator"
    ? "модератора"
    : role === "practitioner"
      ? "практика"
      : "клиента";
  const event = role === "moderator" ? "ACCOUNT_MODERATOR_INVITE" : "ACCOUNT_PASSWORD_SET_INVITE";
  const subject = role === "moderator"
    ? "Приглашение в команду ETerapy"
    : "Ваш аккаунт ETerapy готов";

  return withAccountEmailLog(
    { recipient: email, event, subject },
    () => getResendClient().emails.send({
      from: FROM,
      to: email,
      subject,
      html: emailWrapper(`
        ${h1(role === "moderator" ? "Вас пригласили в команду" : "Ваш аккаунт готов")}
        <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Привет, ${name}!</p>
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Для вас создан аккаунт ${roleLabel} ETerapy. Задайте свой пароль по одноразовой ссылке — она действует 1 час.</p>
        ${btn(url, "Задать пароль")}
        <p style="margin:24px 0 0;color:${INK_FAINT};font-size:12px">Если вы не ожидали приглашения, просто проигнорируйте это письмо.</p>
      `),
    }),
  );
}

export async function sendPractitionerApplicationApprovedEmail(
  email: string,
  name: string,
  token: string,
) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;
  const subject = "Заявка специалиста одобрена — ETerapy";
  return withAccountEmailLog(
    { recipient: email, event: "ACCOUNT_APPLICATION_DECISION", subject },
    () => getResendClient().emails.send({
      from: FROM,
      to: email,
      subject,
      html: emailWrapper(`
        ${h1("Заявка одобрена")}
        <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Привет, ${name}!</p>
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Мы создали для вас кабинет практика ETerapy. Задайте пароль по одноразовой ссылке — она действует 1 час. После входа можно завершить оформление профиля.</p>
        ${btn(url, "Задать пароль и войти")}
      `),
    }),
  );
}

export async function sendPractitionerApplicationDecisionEmail(
  email: string,
  name: string,
  approved: boolean,
) {
  const subject = approved
    ? "Проверка профиля завершена — ETerapy"
    : "Решение по заявке специалиста — ETerapy";
  return withAccountEmailLog(
    { recipient: email, event: "ACCOUNT_APPLICATION_DECISION", subject },
    () => getResendClient().emails.send({
      from: FROM,
      to: email,
      subject,
      html: emailWrapper(`
        ${h1(approved ? "Профиль подтверждён" : "Заявка не одобрена")}
        <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Привет, ${name}!</p>
        <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">${approved
          ? "Проверка завершена: статус профиля обновлён в кабинете."
          : "Сейчас мы не можем одобрить заявку. Если нужны уточнения или повторная подача, ответьте на это письмо — команда поддержки поможет разобраться."}</p>
        ${approved ? btn(`${APP_URL}/cabinet/practitioner`, "Открыть кабинет") : ""}
      `),
    }),
  );
}

/**
 * B599 (батч №20) · Подтверждение запроса на удаление аккаунта.
 *
 * Дыра, вскрытая каталогом служебных событий: человек нажимал «Удалить
 * аккаунт», немедленно вылетал из сессии — и не получал НИЧЕГО. При этом у него
 * есть 10 дней, чтобы передумать, и узнать об этом было неоткуда: экран с
 * условием он уже закрыл вместе с сессией.
 *
 * Письмо уходит всегда и переключателя не имеет: это подтверждение
 * разрушительного действия, а не рассылка.
 */
export async function sendAccountDeletionRequestedEmail(
  email: string,
  name: string,
  purgeAt: Date,
) {
  const purgeStr = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(purgeAt);

  return withAccountEmailLog(
    { recipient: email, event: "ACCOUNT_DELETION_REQUESTED", subject: "Аккаунт деактивирован — ETerapy" },
    () => getResendClient().emails.send({
    from: FROM, to: email,
    subject: "Аккаунт деактивирован — ETerapy",
    html: emailWrapper(`
      ${h1("Аккаунт деактивирован")}
      <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Привет, ${name}!</p>
      <p style="margin:0 0 8px;color:${INK_SOFT};line-height:1.6">Мы получили запрос на удаление аккаунта и деактивировали его. Данные будут удалены безвозвратно <strong style="color:${BORDEAUX}">${purgeStr}</strong>.</p>
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Если вы передумаете — просто войдите в аккаунт до этой даты, и удаление отменится. После указанной даты восстановить ничего нельзя.</p>
      ${btn(`${APP_URL}/login`, "Войти и отменить удаление")}
      <p style="margin:24px 0 0;color:${INK_FAINT};font-size:12px">Если запрос отправляли не вы — войдите в аккаунт прямо сейчас и смените пароль.</p>
    `),
    }),
  );
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
  return getResendClient().emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Запрос отправлен — ${d.practitionerName} · ETerapy`,
    html: emailWrapper(`
      ${h1("Запрос отправлен!")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Привет, ${d.clientName}!</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f6efe1;border:1px solid ${PAPER_EDGE};border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Практик</p>
          <p style="margin:0 0 16px;color:${BORDEAUX};font-weight:600;font-size:16px">${d.practitionerName}</p>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:${BORDEAUX};font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Длительность · Стоимость</p>
          <p style="margin:0;color:${TERRACOTTA};font-weight:700;font-size:18px">${d.durationMin} мин · ${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">
        Практик подтвердит запись в течение нескольких часов. Оплата производится после подтверждения.
      </p>
      ${btn(`${APP_URL}/cabinet/bookings`, "Мои записи")}
    `),
  });
}

/** Практику: новый запрос от клиента */
export async function sendBookingRequestedPractitioner(d: BookingEmailData) {
  return getResendClient().emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Новый запрос от ${d.clientName} · ETerapy`,
    html: emailWrapper(`
      ${h1("Новый запрос на сессию")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">К вам хочет записаться <strong style="color:${BORDEAUX}">${d.clientName}</strong>.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f6efe1;border:1px solid ${PAPER_EDGE};border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:${BORDEAUX};font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Длительность · Стоимость</p>
          <p style="margin:0;color:${TERRACOTTA};font-weight:700;font-size:18px">${d.durationMin} мин · ${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">Подтвердите или отклоните запрос в вашем кабинете.</p>
      ${btn(`${APP_URL}/cabinet/practitioner/clients`, "Открыть кабинет")}
    `),
  });
}

/** Клиенту: практик подтвердил */
export async function sendBookingConfirmedClient(d: BookingEmailData) {
  return getResendClient().emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Сессия подтверждена — ${d.practitionerName} · ETerapy`,
    html: emailWrapper(`
      ${h1("✅ Сессия подтверждена!")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Привет, ${d.clientName}!</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Практик</p>
          <p style="margin:0 0 16px;color:${BORDEAUX};font-weight:600;font-size:16px">${d.practitionerName}</p>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:${BORDEAUX};font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Стоимость</p>
          <p style="margin:0;color:${TERRACOTTA};font-weight:700;font-size:18px">${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">
        Ссылка на видеосессию станет доступна в вашей записи. Мы пришлём напоминание за 24 часа.
      </p>
      ${btn(`${APP_URL}/cabinet/bookings`, "Мои записи")}
    `),
  });
}

/** Практику: запись подтверждена (ссылка на видеочат) */
export async function sendBookingConfirmedPractitioner(d: BookingEmailData & { sessionUrl?: string }) {
  const sessionUrl = d.sessionUrl || `${APP_URL}/session/${d.bookingId}`;
  return getResendClient().emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Запись подтверждена — ${d.clientName} · ETerapy`,
    html: emailWrapper(`
      ${h1("✅ Запись подтверждена!")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Привет, ${d.practitionerName}!</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Клиент</p>
          <p style="margin:0 0 16px;color:${BORDEAUX};font-weight:600;font-size:16px">${d.clientName}</p>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Время</p>
          <p style="margin:0 0 16px;color:${BORDEAUX};font-weight:600">${d.slotStr}</p>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Стоимость</p>
          <p style="margin:0;color:${TERRACOTTA};font-weight:700;font-size:18px">${d.priceRub.toLocaleString("ru")} ₽</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Используйте ссылку ниже для подключения к видеосессии.</p>
      ${btn(sessionUrl, "Войти в видеочат")}
      <p style="margin:16px 0 0;color:${INK_FAINT};font-size:12px">Ссылка также доступна в вашем кабинете в карточке записи.</p>
    `),
  });
}

/** Практику: напоминание за 24 часа */
export async function sendReminderPractitioner(d: BookingEmailData) {
  return getResendClient().emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Напоминание: сессия завтра — ${d.clientName} · ETerapy`,
    html: emailWrapper(`
      ${h1("⏰ Сессия завтра")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Напоминаем о предстоящей сессии с <strong style="color:${BORDEAUX}">${d.clientName}</strong>.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f6efe1;border:1px solid ${PAPER_EDGE};border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Время</p>
          <p style="margin:0;color:${BORDEAUX};font-weight:600;font-size:16px">${d.slotStr}</p>
        </td></tr>
      </table>
      ${btn(`${APP_URL}/cabinet/practitioner/clients`, "Открыть кабинет")}
    `),
  });
}

/** Клиенту: напоминание за 24 часа */
export async function sendReminderClient(d: BookingEmailData) {
  return getResendClient().emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Напоминание: сессия завтра — ${d.practitionerName} · ETerapy`,
    html: emailWrapper(`
      ${h1("⏰ Сессия завтра")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Привет, ${d.clientName}! Напоминаем о предстоящей сессии с <strong style="color:${BORDEAUX}">${d.practitionerName}</strong>.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f6efe1;border:1px solid ${PAPER_EDGE};border-radius:8px;padding:20px;width:100%">
        <tr><td>
          <p style="margin:0 0 8px;color:${INK_SOFT};font-size:13px">Время</p>
          <p style="margin:0;color:${BORDEAUX};font-weight:600;font-size:16px">${d.slotStr}</p>
        </td></tr>
      </table>
      ${btn(`${APP_URL}/cabinet/bookings`, "Мои записи")}
    `),
  });
}

/** Клиенту: сессия завершена — предложение оставить отзыв */
export async function sendReviewRequestClient(d: BookingEmailData) {
  return getResendClient().emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Как прошла сессия с ${d.practitionerName}? · ETerapy`,
    html: emailWrapper(`
      ${h1("Как прошла сессия?")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Привет, ${d.clientName}!</p>
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">
        Ваша сессия с <strong style="color:${BORDEAUX}">${d.practitionerName}</strong> завершена.
        Оставьте отзыв — это помогает другим клиентам найти подходящего практика.
      </p>
      ${btn(`${APP_URL}/cabinet/bookings?review=${d.bookingId}`, "Оставить отзыв")}
      <p style="margin:24px 0 0;color:${INK_FAINT};font-size:12px">Отзыв займёт меньше минуты. Спасибо!</p>
    `),
  });
}

/** Клиенту: запись отменена */
export async function sendBookingCancelledClient(d: BookingEmailData, cancelledBy: "client" | "practitioner") {
  return getResendClient().emails.send({
    from: FROM, to: d.clientEmail,
    subject: `Запись отменена — ETerapy`,
    html: emailWrapper(`
      ${h1("Запись отменена")}
      <p style="margin:0 0 16px;color:${INK_SOFT};line-height:1.6">Привет, ${d.clientName}!</p>
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">
        Запись к <strong style="color:${BORDEAUX}">${d.practitionerName}</strong> (${d.slotStr}) была отменена
        ${cancelledBy === "practitioner" ? "практиком" : "вами"}.
        ${cancelledBy === "practitioner" ? "Мы сожалеем о неудобстве. Вы можете вернуться к вопросу и выбрать следующий шаг заново." : ""}
      </p>
      ${btn(`${APP_URL}/checkin`, "Задать новый вопрос")}
    `),
  });
}

/** Практику: запись отменена клиентом */
export async function sendBookingCancelledPractitioner(d: BookingEmailData) {
  return getResendClient().emails.send({
    from: FROM, to: d.practitionerEmail,
    subject: `Запись отменена клиентом — ETerapy`,
    html: emailWrapper(`
      ${h1("Запись отменена")}
      <p style="margin:0 0 28px;color:${INK_SOFT};line-height:1.6">
        <strong style="color:${BORDEAUX}">${d.clientName}</strong> отменил запись на ${d.slotStr}.
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
