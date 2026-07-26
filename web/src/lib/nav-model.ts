import { appUrl, mainUrl } from "@/lib/subdomain";

// B464 IB0 — the single source of truth for the unified, state-aware
// navigation. Kept free of `lucide-react` and any server import so it can be
// unit-tested directly (jest) and shared by both the platform header
// (landing bar) and the cabinet shell (cabinet bar) without drift.
//
// Icons are referenced by a stable string key; the client components map the
// key to the real lucide component (see components/nav/nav-icons.tsx). This
// keeps the model a pure data/logic layer.

export type NavIconKey =
  | "home"
  | "question"
  | "services"
  | "specialists"
  | "diary"
  | "more"
  | "wallet"
  | "bookings"
  | "invite"
  | "settings"
  | "support"
  | "login"
  | "back"
  | "logout"
  | "library"
  | "how"
  | "pricing"
  // B466 — practitioner «Practice cockpit» tabs.
  | "today"
  | "clients"
  | "calendar"
  | "finance"
  | "grid"
  // B478 — клиентские «Сообщения» (материалы от специалиста).
  | "messages";

export interface NavLink {
  /** Empty for action items handled by the component (e.g. «Ещё», «Выйти»). */
  href: string;
  label: string;
}

export interface MobileTab extends NavLink {
  iconKey: NavIconKey;
}

// The sentinel «Ещё» tab carries no destination — the component opens a sheet.
export const MORE_LABEL = "Ещё";
// The «Выйти» sheet row triggers a logout instead of navigating.
export const LOGOUT_LABEL = "Выйти";

// ── Landing top nav (desktop). hrefs stay relative; the header maps them
//    through mainUrl() so they always point at the public site. ──────────────
export const LANDING_NAV: NavLink[] = [
  { href: "/how-it-works", label: "Как работает" },
  // B594 (владелец 2026-07-27): «Услуги» ничего не обещало и не объясняло, куда
  // ведёт. Существительное к тому же читалось как «мои услуги». Глагол называет
  // действие и не может быть спутан с личным разделом, а «разбор» — то самое
  // слово, которым продукт говорит о себе везде.
  { href: "/products", label: "Разобрать" },
  { href: "/practitioners", label: "Специалисты" },
  { href: "/pricing", label: "Тарифы" },
  { href: "/library", label: "Библиотека" },
];

// ── Cabinet header service bridge (shown in the cabinet for clients, filling
//    the previously-empty centre nav so services are one click away). ─────────
export const CABINET_BRIDGE: NavLink[] = [
  { href: mainUrl("/"), label: "На сайт" },
  { href: mainUrl("/products"), label: "Разобрать" },
  { href: mainUrl("/practitioners"), label: "Специалисты" },
  { href: mainUrl("/library"), label: "Библиотека" },
];

// ── Mobile bottom bar — logged-in client. Slot 1 returns to the cabinet home;
//    «Вопрос»/«Услуги» reach the free door + services (cross-shell). B512: the
//    «Ещё» tab NAVIGATES to the real hub page (/cabinet/more), mirroring the
//    practitioner cockpit — the bottom-sheet is gone. ─────────────────────────
export const CLIENT_MOBILE_TABS: MobileTab[] = [
  { href: appUrl("/"), label: "Главная", iconKey: "home" },
  { href: mainUrl("/checkin"), label: "Вопрос", iconKey: "question" },
  { href: mainUrl("/products"), label: "Разобрать", iconKey: "services" },
  { href: appUrl("/diary"), label: "Дневник", iconKey: "diary" },
  { href: appUrl("/more"), label: MORE_LABEL, iconKey: "more" },
];

// ── Mobile bottom bar — guest. Slot 1 = «Войти» (owner decision). ────────────
export const GUEST_MOBILE_TABS: MobileTab[] = [
  { href: mainUrl("/login"), label: "Войти", iconKey: "login" },
  { href: mainUrl("/checkin"), label: "Вопрос", iconKey: "question" },
  { href: mainUrl("/products"), label: "Разобрать", iconKey: "services" },
  { href: mainUrl("/practitioners"), label: "Специалисты", iconKey: "specialists" },
  { href: "", label: MORE_LABEL, iconKey: "more" },
];

// ── B512 — client «Ещё» hub page sections (/cabinet/more, mirrors the
//    practitioner hub). «Кабинет» = cabinet surfaces off the primary tabs;
//    «Платформа» = cross-shell landing destinations (replaces the bare
//    «На сайт» row — owner: Платформа covers it); «Аккаунт» = settings +
//    support. «Выйти» renders as its own row on the page. ────────────────────
export interface MoreSection {
  heading: string;
  items: MobileTab[];
}

export const CLIENT_MORE_SECTIONS: MoreSection[] = [
  {
    heading: "Кабинет",
    items: [
      { href: appUrl("/bookings"), label: "Записи", iconKey: "bookings" },
      // B478: односторонние материалы от специалиста — под «Ещё», НЕ
      // центральный таб (owner: «не мессенджер»).
      { href: appUrl("/messages"), label: "Сообщения", iconKey: "messages" },
      { href: appUrl("/wallet"), label: "Кошелёк", iconKey: "wallet" },
      { href: appUrl("/invite"), label: "Приглашения", iconKey: "invite" },
    ],
  },
  {
    heading: "Платформа",
    items: [
      { href: mainUrl("/products"), label: "Разобрать", iconKey: "services" },
      { href: mainUrl("/practitioners"), label: "Специалисты", iconKey: "specialists" },
      { href: mainUrl("/library"), label: "Библиотека", iconKey: "library" },
    ],
  },
  {
    heading: "Аккаунт",
    items: [
      { href: appUrl("/settings"), label: "Настройки", iconKey: "settings" },
      { href: appUrl("/support"), label: "Поддержка", iconKey: "support" },
    ],
  },
];

// Flat legacy view of the hub destinations — kept for the landing-header
// mobile sheet fallback and the «Ещё» umbrella active-state.
export const CLIENT_MORE_ITEMS: MobileTab[] = [
  ...CLIENT_MORE_SECTIONS.flatMap((section) => section.items),
  { href: "", label: LOGOUT_LABEL, iconKey: "logout" },
];

// Sub-routes under the client «Ещё» umbrella — the tab lights up when any of
// these cabinet routes is active (cross-shell «Платформа» rows excluded).
export const CLIENT_MORE_HREFS: string[] = [
  appUrl("/more"),
  appUrl("/bookings"),
  appUrl("/messages"),
  appUrl("/wallet"),
  appUrl("/invite"),
  appUrl("/settings"),
  appUrl("/support"),
];

// ── «Ещё» sheet — guest. «Войти» is already a primary tab, so it is omitted. ──
export const GUEST_MORE_ITEMS: MobileTab[] = [
  { href: mainUrl("/how-it-works"), label: "Как работает", iconKey: "how" },
  { href: mainUrl("/library"), label: "Библиотека", iconKey: "library" },
  { href: mainUrl("/pricing"), label: "Тарифы", iconKey: "pricing" },
];

// ── B466 — practitioner «Practice cockpit» IA. One 5-item model drives BOTH
//    the desktop sidebar and the mobile bottom bar (owner caveat: the
//    practitioner sidebar must stay as polished as the client's — same shell,
//    same model). «Ещё» is a real hub page (/practitioner/more), not a sheet:
//    the approved mockup shows a full screen with profile card + groups. ─────
export const PRACTITIONER_TABS: MobileTab[] = [
  { href: appUrl("/practitioner"), label: "Сегодня", iconKey: "today" },
  { href: appUrl("/practitioner/clients"), label: "Клиенты", iconKey: "clients" },
  { href: appUrl("/practitioner/calendar"), label: "Календарь", iconKey: "calendar" },
  { href: appUrl("/practitioner/finance"), label: "Финансы", iconKey: "finance" },
  { href: appUrl("/practitioner/more"), label: MORE_LABEL, iconKey: "grid" },
];

// Sub-routes that live under the «Ещё» umbrella — the tab/sidebar item lights
// up when any of these is active. Kept in sync with the hub page rows.
export const PRACTITIONER_MORE_HREFS: string[] = [
  appUrl("/practitioner/more"),
  appUrl("/practitioner/services"),
  appUrl("/practitioner/reviews"),
  appUrl("/practitioner/invite"),
  appUrl("/practitioner/ethics"),
  appUrl("/practitioner/crisis"),
  appUrl("/practitioner/profile"),
  appUrl("/practitioner/settings"),
  appUrl("/practitioner/verification"),
  appUrl("/practitioner/ai-usage"),
];
