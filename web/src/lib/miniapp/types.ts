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
  };
  dialogues: MiniAppDialogue[];
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
  loadError: boolean;
};
