import type { V5ProductSlug } from "@/lib/v5-products";

export type MiniAppViewId = "home" | "dialogues" | "services" | "diary" | "profile";

export type MiniAppFeature = {
  id: MiniAppViewId;
  label: string;
  route: string;
  central?: boolean;
  protected?: boolean;
};

export type MiniAppServiceApproach = "psychology" | "symbolic" | "mixed";
export type MiniAppServiceFormat = "digital" | "specialist";

export type MiniAppService = {
  id: string;
  slug: V5ProductSlug | "primary" | "chat-session" | "specialist";
  title: string;
  eyebrow: string;
  description: string;
  price: string;
  priceMeta: string;
  /** B556: что у услуги доступно до оплаты. Отдельной строкой, а не хвостом цены. */
  freeNote?: string;
  creditCost: number | null;
  href: string;
  cta: string;
  mechanics: string[];
  privacy: string;
  result: string;
  approach: MiniAppServiceApproach;
  format: MiniAppServiceFormat;
  featured?: boolean;
  shareable?: boolean;
  diaryOnly?: boolean;
};

export type MiniAppDialogue = {
  id: string;
  title: string;
  topic: string;
  status: string;
  updated: string;
  messageCount: number;
  href: string;
};

export type MiniAppDiaryItem = {
  id: string;
  title: string;
  type: string;
  topic: string;
  date: string;
  /** Число месяца записи — для компактных чипов «последние дни». */
  dayLabel: string;
  insight: string;
  href: string;
};

/**
 * B554 п.20: «Ваши записи» — те же карточки дней, что и в вебе
 * (`JournalCardsStrip`): день практики, вопрос этого дня и то, что человек на
 * него получил. Раньше мини-апп показывал здесь пять последних РАЗБОРОВ, и в
 * ряду стояли числа вроде «20, 20, 20, 20, 17».
 */
export type MiniAppJournalEntry = {
  id: string;
  /** «14» — крупная цифра карточки. */
  dayLabel: string;
  /** «июл» — короткий месяц. */
  monthLabel: string;
  /** «понедельник, 14 июля» — заголовок панели. */
  fullDateLabel: string;
  question: string;
  own: boolean;
  perspective: string | null;
  step: string | null;
};

export type MiniAppLibraryItem = {
  slug: string;
  topic: string;
  question: string;
  href: string;
};

export type MiniAppPractitioner = {
  name: string;
  title: string;
  price: string;
  href: string;
  avatar: string | null;
};

export type MiniAppBooking = {
  id: string;
  practitioner: string;
  status: string;
  date: string;
  price: string;
  canJoin: boolean;
};

export type MiniAppMaterial = {
  id: string;
  practitioner: string;
  preview: string;
  date: string;
  unread: boolean;
  attachmentName: string | null;
};

export type MiniAppInitialData = {
  viewer: {
    authenticated: boolean;
    client: boolean;
    firstName: string;
    points: number;
    plan: string;
    planStatus: string;
    email: string | null;
    hasPassword: boolean;
    telegramLinked: boolean;
    /**
     * B555: включён ли вообще вход через Telegram на этом стенде. Без этого
     * признака экран предлагал привязку там, где сервер отвечает 404, и
     * показывал отказ как ошибку клиента.
     */
    telegramLinkAvailable: boolean;
  };
  dialogues: MiniAppDialogue[];
  /** Курсор следующей порции активных диалогов. */
  dialogueNextCursor: string | null;
  diaryItems: MiniAppDiaryItem[];
  journalEntries: MiniAppJournalEntry[];
  libraryItems: MiniAppLibraryItem[];
  practitioner: MiniAppPractitioner | null;
  bookings: MiniAppBooking[];
  materials: MiniAppMaterial[];
  profileNotice: boolean;
  upcomingBookingLabel: string | null;
  streak: number;
  completedWeekdays: number[];
  /**
   * B678 — карта дня Таро. Вычисляется детерминированно по человеку и
   * МСК-дате, в базу ничего не пишет. `null` у гостя и при сбое загрузки.
   */
  tarotDay: MiniAppTarotDay | null;
  /**
   * B554 (owner): готов ли платёжный рельс принимать карту ПРЯМО СЕЙЧАС.
   * Кнопки и копия про оплату идут от этого флага, а не от захардкоженного
   * «скоро» — иначе после подключения провайдера интерфейс продолжал бы врать,
   * а до подключения уводил бы человека в тупик.
   */
  cardPaymentEnabled: boolean;
  loadError: boolean;
};

export type MiniAppTarotDay = {
  key: string;
  name: string;
  reversed: boolean;
  artworkUrl: string;
  headline: string;
  body: string;
  focus: string;
};
