/**
 * B599 (батч №20) · Каталог СЛУЖЕБНЫХ уведомлений.
 *
 * Владелец: «мне важно чтобы в этом же разделе был перечень событий
 * "регистрация", "запрос сброса пароля", "запрос удаления аккаунта", "запись к
 * практику", "приближающаяся запись к практику" и другие события, которые есть
 * в личном кабинете в разделе "уведомления"».
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ СПИСОК, А НЕ СТРОКИ В МАРКЕТИНГОВОЙ МАТРИЦЕ. Служебное
 * уведомление уходит ВСЕГДА: оно сообщает человеку факт о его деньгах, доступе
 * или встрече. Согласия на рекламу оно не спрашивает, и отписка от рекламы его
 * не выключает — иначе нажатие «отписаться» в письме об акции отключило бы чек
 * об оплате и напоминание о сессии. Гейты из `marketing/gates.ts` к этим
 * событиям не применяются вовсе.
 *
 * Источник правды для 39 событий — `notification-events.ts` (`ALL_EVENTS`): тот
 * же список рисует переключатели в кабинете. Здесь он ТОЛЬКО обогащается
 * триггером и каналами; дублировать его вторым перечнем значило бы завести два
 * списка, которые разойдутся на первом же новом событии.
 *
 * ⚠ АККАУНТНЫЕ ПИСЬМА ЖИВУТ ОТДЕЛЬНО. Подтверждение почты, сброс пароля,
 * приглашение модератора и запрос удаления аккаунта уходят НЕ через `notify()`,
 * а прямыми вызовами `lib/email.ts`. У них нет переключателя в кабинете и не
 * должно быть: выключить себе письмо для сброса пароля — значит потерять доступ
 * к аккаунту. Именно поэтому их не было видно нигде: ни в кабинете, ни в
 * админке.
 */

import {
  ALL_EVENTS,
  NOTIFICATION_CATEGORY_META,
  type NotifEvent,
  type NotificationCategory,
  type UserRole,
} from "@/lib/notification-events";
import { renderNotificationEmailSnapshot } from "@/lib/email-send";

export type SystemChannel = "email" | "telegram" | "web";

export interface SystemEventRow {
  key: string;
  /** `notify` — через настройки кабинета; `account` — прямое письмо без переключателя. */
  kind: "notify" | "account";
  label: string;
  category: NotificationCategory;
  audience: string;
  trigger: string;
  channels: SystemChannel[];
  /** Можно ли это отключить человеку. `false` — только для аккаунтных писем. */
  optional: boolean;
}

/**
 * Когда именно уходит каждое событие. Описание из `ALL_EVENTS` отвечает на
 * вопрос «что это», здесь — «в какой момент»: без второго список нельзя
 * принимать, потому что спорят обычно не о названии, а о моменте отправки.
 */
const NOTIFY_TRIGGERS: Record<NotifEvent, string> = {
  BOOKING_REQUESTED: "Клиент отправил запрос на сессию — сразу",
  BOOKING_CONFIRMED: "Специалист подтвердил запрос — сразу",
  BOOKING_CANCELLED: "Любая сторона отменила запись — сразу",
  BOOKING_REMINDER: "За 24 часа и за 1 час до начала (настраивается человеком)",
  BOOKING_PROPOSED: "Специалист предложил клиенту слот — сразу",
  BOOKING_CHANGE_REQUESTED: "Подан запрос на перенос или отмену — сразу другой стороне",
  BOOKING_CHANGE_RESOLVED: "Запрос переноса/отмены согласован или отклонён — сразу",
  GOODWILL_CREDITS: "Платформа начислила компенсацию за сорванную сессию",
  RELIABILITY_WARNING: "Метрика надёжности специалиста перешла порог за 30 дней",
  PRACTITIONER_MESSAGE: "Специалист отправил клиенту материал или задание",
  SESSION_STARTED: "Видеокомната открыта — сразу второй стороне",
  SESSION_COMPLETED: "Сессия завершена — сразу обеим сторонам",
  REVIEW_REQUESTED: "Через час после завершения сессии",
  NEW_REVIEW: "Клиент опубликовал отзыв — сразу специалисту",
  PAYMENT_RECEIVED: "Платёж по сессии зачислен специалисту",
  PAYOUT_SCHEDULED: "Сводка по выплатам 1-го и 15-го числа — суперадмину",
  BALANCE_TOPUP: "Пополнение кошелька подтверждено платёжным рельсом",
  PRODUCT_UNLOCKED: "Оплата услуги подтверждена, доступ открыт",
  SUBSCRIPTION_STARTED: "Подписка оплачена или начат пробный период",
  SUBSCRIPTION_RENEWAL: "За 3 дня до АВТОМАТИЧЕСКОГО списания за подписку",
  SUBSCRIPTION_CANCELLED: "Подписка отменена человеком или платформой",
  SUBSCRIPTION_PAYMENT_FAILED: "Списание за подписку не прошло",
  CARD_LINKED: "Новая карта привязана к аккаунту",
  CARD_REMOVED: "Карта отвязана от аккаунта",
  DAILY_CARD: "Утром, если человек включил карту дня",
  ABANDONED_CHECKOUT: "Оплата начата и не завершена — через час",
  REPORT_READY: "Генерация платного разбора закончилась",
  PARTNER_COMPLETED: "Второй участник парного сценария закончил свою часть",
  CIRCLE_READY: "Собрано достаточно ответов для общего вывода",
  ROUTE_REMINDER: "По расписанию маршрута, выбранному человеком",
  WEEKLY_DIGEST: "Раз в неделю, если человек включил дайджест",
  PRACTITIONER_DIGEST: "Раз в неделю специалисту с активными записями",
  COMPLIANCE_ALERT: "Сработал риск-флаг по сессии или жалобе",
  CREDITS_EXPIRING: "За 2–3 дня до сгорания баллов",
  STREAK_AT_RISK: "Пропущен день практики при активном ритме",
  MOMENT_OF_NEED: "Редкое возвращение к сохранённой теме после паузы",
  WELCOME_CREDITS: "Приветственные баллы начислены при регистрации",
  WELCOME_CREDITS_REMINDER: "Приветственные баллы не потрачены неделю",
};

const ROLE_LABELS: Record<UserRole, string> = {
  CLIENT: "клиент",
  PRACTITIONER: "специалист",
  ADMIN: "администратор",
  SUPERADMIN: "суперадмин",
  MODERATOR: "модератор",
};

/**
 * Письма, уходящие мимо `notify()`.
 *
 * Каждое из них — необходимое условие пользования аккаунтом, поэтому
 * `optional: false`. Список ручной ровно потому, что эти письма не описаны
 * нигде в коде как данные: они зашиты в вызовы `lib/email.ts`.
 */
export const ACCOUNT_EVENTS: readonly SystemEventRow[] = [
  {
    key: "ACCOUNT_EMAIL_VERIFY",
    kind: "account",
    label: "Регистрация: подтверждение почты",
    category: "system",
    audience: "Только что зарегистрировавшийся",
    trigger: "Сразу после регистрации; ссылка живёт 24 часа",
    channels: ["email"],
    optional: false,
  },
  {
    key: "ACCOUNT_EMAIL_VERIFY_RESEND",
    kind: "account",
    label: "Повторная отправка подтверждения",
    category: "system",
    audience: "Не подтвердивший почту",
    trigger: "По нажатию «отправить ещё раз» в плашке кабинета. Тот же текст, что при регистрации",
    channels: ["email"],
    optional: false,
  },
  {
    key: "ACCOUNT_PASSWORD_RESET",
    kind: "account",
    label: "Запрос сброса пароля",
    category: "system",
    audience: "Запросивший восстановление доступа",
    trigger: "По запросу с формы «забыли пароль»; ссылка живёт 1 час",
    channels: ["email"],
    optional: false,
  },
  {
    key: "ACCOUNT_PASSWORD_SET_INVITE",
    kind: "account",
    label: "Приглашение задать пароль",
    category: "system",
    audience: "Заведённый администратором или вошедший через соцсеть",
    trigger: "При создании аккаунта из админки или по запросу пароля к соцвходу; письмо прямо объясняет, что аккаунт создан и нужно задать пароль",
    channels: ["email"],
    optional: false,
  },
  {
    key: "ACCOUNT_DELETION_REQUESTED",
    kind: "account",
    label: "Запрос удаления аккаунта",
    category: "system",
    audience: "Нажавший «удалить аккаунт» в настройках",
    trigger: "Сразу после деактивации; в письме — дата безвозвратного удаления и как отменить",
    channels: ["email"],
    optional: false,
  },
  {
    key: "ACCOUNT_MODERATOR_INVITE",
    kind: "account",
    label: "Приглашение модератора",
    category: "system",
    audience: "Приглашённый в служебную роль",
    trigger: "Суперадмин создал модератора или администратора; отдельное приглашение в команду со ссылкой задания пароля",
    channels: ["email"],
    optional: false,
  },
  {
    key: "ACCOUNT_APPLICATION_DECISION",
    kind: "account",
    label: "Решение по заявке специалиста",
    category: "system",
    audience: "Подавший заявку на работу на платформе",
    trigger: "При одобрении, отклонении или завершении верификации; одобрение нового аккаунта содержит ссылку задания пароля",
    channels: ["email"],
    optional: false,
  },
] as const;

/**
 * Каналы служебного события. WEB (колокольчик) есть у всех: он ничего не шлёт
 * наружу и выключать его нечем. EMAIL — по умолчанию у списка
 * `DEFAULT_EMAIL_EVENTS`, но переключатель есть у всех, поэтому в каталоге
 * почта указана везде: важно, что она ВОЗМОЖНА, а не что она включена сегодня.
 */
function notifyChannels(): SystemChannel[] {
  return ["email", "telegram", "web"];
}

/** Полный служебный каталог: 39 событий кабинета + 7 аккаунтных писем. */
export function systemEventCatalog(): SystemEventRow[] {
  const notifyRows: SystemEventRow[] = ALL_EVENTS.map((event) => ({
    key: event.event,
    kind: "notify" as const,
    label: event.label,
    category: event.category,
    audience: event.roles.map((role) => ROLE_LABELS[role]).join(", "),
    trigger: NOTIFY_TRIGGERS[event.event] ?? event.description,
    channels: notifyChannels(),
    optional: true,
  }));

  return [...notifyRows, ...ACCOUNT_EVENTS];
}

const PREVIEW_DATA: Record<string, string> = {
  clientName: "Клиент",
  practitionerName: "Специалист",
  withName: "Специалист",
  date: "12 августа",
  time: "18:00",
  in: "24 часа",
  amountRub: "2 000",
  totalRub: "12 000",
  practitionerCount: "3",
  planKey: "Стандарт",
  productKey: "reframe",
  points: "300",
  amount: "300",
  balance: "500",
  expiresAt: "25 августа",
  days: "3",
  title: "Ваш вопрос",
  question: "Стоит ли менять работу?",
  bookingId: "пример",
  sessionUrl: "https://app.eterapy.com/cabinet/bookings",
  reviewUrl: "https://app.eterapy.com/cabinet/bookings",
  walletUrl: "https://app.eterapy.com/cabinet/wallet",
  href: "/cabinet",
  rating: "5",
  text: "Спасибо за встречу",
  type: "RESCHEDULE",
  byName: "Клиент",
  proposed: "13 августа, 19:00",
  preview: "Материал к следующей встрече",
  reason: "По вашему обращению",
  lateCancels: "1",
  noShows: "0",
};

const ACCOUNT_PREVIEWS: Record<string, { subject: string; body: string }> = {
  ACCOUNT_EMAIL_VERIFY: {
    subject: "Подтвердите email — ETerapy",
    body: "Здравствуйте!\n\nПодтвердите адрес электронной почты, чтобы завершить регистрацию.\n\nКнопка: Подтвердить email\nСсылка действует 24 часа.",
  },
  ACCOUNT_EMAIL_VERIFY_RESEND: {
    subject: "Подтвердите email — ETerapy",
    body: "Здравствуйте!\n\nЭто повторное письмо для подтверждения адреса электронной почты.\n\nКнопка: Подтвердить email\nСсылка действует 24 часа.",
  },
  ACCOUNT_PASSWORD_RESET: {
    subject: "Сброс пароля — ETerapy",
    body: "Получен запрос на сброс пароля.\n\nКнопка: Задать новый пароль\nСсылка действует 1 час. Если вы не запрашивали сброс, ничего делать не нужно.",
  },
  ACCOUNT_PASSWORD_SET_INVITE: {
    subject: "Ваш аккаунт ETerapy готов",
    body: "Администратор создал аккаунт.\n\nКнопка: Задать пароль\nОдноразовая ссылка действует 1 час.",
  },
  ACCOUNT_DELETION_REQUESTED: {
    subject: "Запрос на удаление аккаунта — ETerapy",
    body: "Аккаунт деактивирован. В письме указана дата окончательного удаления и способ отменить запрос до этой даты.",
  },
  ACCOUNT_MODERATOR_INVITE: {
    subject: "Приглашение в команду ETerapy",
    body: "Для служебной роли создан аккаунт. Приглашённый задаёт собственный пароль по одноразовой ссылке; ссылка в журнале не сохраняется.",
  },
  ACCOUNT_APPLICATION_DECISION: {
    subject: "Решение по заявке специалиста — ETerapy",
    body: "При одобрении создаётся кабинет и отправляется ссылка для задания пароля. При отклонении заявитель получает понятное решение и канал для уточнений.",
  },
};

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h1|h2|h3|tr|table|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Пример текста из того же рендера, которым реально отправляется email. */
export function systemEventPreview(row: SystemEventRow): {
  subject: string;
  body: string;
} {
  if (row.kind === "account") {
    return ACCOUNT_PREVIEWS[row.key] ?? { subject: row.label, body: row.trigger };
  }
  const snapshot = renderNotificationEmailSnapshot({
    event: row.key as NotifEvent,
    name: "Алексей",
    data: PREVIEW_DATA,
  });
  return { subject: snapshot.subject, body: htmlToText(snapshot.html) };
}

export const SYSTEM_CATEGORY_LABELS: Record<NotificationCategory, string> = Object.fromEntries(
  Object.entries(NOTIFICATION_CATEGORY_META).map(([key, meta]) => [key, meta.label]),
) as Record<NotificationCategory, string>;
