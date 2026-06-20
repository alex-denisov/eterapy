// B431 (M28 RU/Yandex launch): single source of truth for ETerapy's public legal
// documents. Drives the /legal/[doc] pages, the registration consent checkboxes
// (B427) and the payment offer-version binding (B424). The rendered text lives in
// `web/src/content/legal-pack.md` (a copy of the full-replacement pack
// `docs/eterapy_legal_documents_ru_yandex.md`); this module only owns metadata,
// routing and versioning.

export const LEGAL_PACK_VERSION = "1.0";
export const LEGAL_PACK_PUBLISHED_AT = "2026-06-18";

export type LegalDocSlug =
  | "offer"
  | "terms"
  | "privacy"
  | "consent"
  | "cookies"
  | "disclaimer"
  | "points"
  | "subscriptions"
  | "agent-offer"
  | "ethics"
  | "practitioner-terms"
  | "sessions"
  | "uploads"
  | "transcription";

export interface LegalDocMeta {
  slug: LegalDocSlug;
  /** "Документ N" in the source pack. */
  docNumber: number;
  /** Page <h1> and document title. */
  title: string;
  /** Short label for the legal nav / consent links. */
  navLabel: string;
  /** One-line description for SEO/meta tags. */
  description: string;
  /** Primary audience — practitioner docs are grouped separately in the nav. */
  audience: "user" | "practitioner";
  version: string;
  publishedAt: string;
}

function userDoc(
  slug: LegalDocSlug,
  docNumber: number,
  title: string,
  navLabel: string,
  description: string,
  audience: "user" | "practitioner" = "user",
): LegalDocMeta {
  return {
    slug,
    docNumber,
    title,
    navLabel,
    description,
    audience,
    version: LEGAL_PACK_VERSION,
    publishedAt: LEGAL_PACK_PUBLISHED_AT,
  };
}

// Ordered by source-pack document number. Documents 15, 16, 17 and 19 are marked
// "не для публикации" in the pack and are intentionally NOT routable here.
export const LEGAL_DOCUMENTS: readonly LegalDocMeta[] = [
  userDoc("offer", 1, "Публичная оферта", "Оферта", "Публичная оферта ETerapy для пользователей РФ: предмет, цифровые услуги, баллы, подписки, сессии, оплата и возвраты."),
  userDoc("terms", 2, "Пользовательское соглашение", "Соглашение", "Правила использования ETerapy: аккаунт, способы входа, контент, гостевой режим, поведение и блокировки."),
  userDoc("privacy", 3, "Политика обработки персональных данных", "Конфиденциальность", "Какие данные обрабатывает ETerapy, цели, сроки хранения, права субъекта и локализация обработки в РФ (152-ФЗ)."),
  userDoc("consent", 4, "Согласие на обработку персональных данных", "Согласие на ПДн", "Согласие на обработку персональных данных, включая специальные категории, при регистрации в ETerapy."),
  userDoc("cookies", 5, "Cookie Policy", "Cookies", "Какие cookies использует ETerapy, зачем и как управлять ими."),
  userDoc("disclaimer", 6, "Дисклеймер", "Дисклеймер", "Услуги ETerapy носят информационно-рефлексивный характер и не заменяют медицинскую, психологическую или юридическую помощь."),
  userDoc("points", 7, "Правила баллов ясности", "Баллы ясности", "Что такое баллы ясности, как они начисляются, списываются и когда сгорают."),
  userDoc("subscriptions", 8, "Правила подписок Plus / Premium", "Подписки", "Состав, оплата, продление и отмена подписок ETerapy Plus и Premium."),
  userDoc("agent-offer", 9, "Агентская оферта для специалистов", "Агентская оферта", "Условия работы специалистов через ETerapy: агентская модель, комиссия и выплаты.", "practitioner"),
  userDoc("ethics", 10, "Кодекс практиков", "Кодекс практиков", "Этические правила специалистов ETerapy: безопасность, границы, запрет давления и последствия нарушений.", "practitioner"),
  userDoc("practitioner-terms", 11, "Practitioner Pro / Pro+ Terms", "Pro / Pro+", "Условия профессиональных подписок специалистов ETerapy Pro и Pro+.", "practitioner"),
  userDoc("sessions", 12, "Правила сессий со специалистами", "Сессии", "Правила бронирования, отмены и диспутов по сессиям со специалистами ETerapy."),
  userDoc("uploads", 13, "Правила загрузки переписки и материалов", "Загрузка материалов", "Правила загрузки переписки и материалов третьих лиц и ответственность пользователя."),
  userDoc("transcription", 14, "Согласие на транскрибацию сессии", "Транскрибация", "Уведомление и согласие на транскрибацию и обработку записи сессии со специалистом."),
];

/**
 * Optional plain-language summary shown above a document's legal text. Preserves
 * the B380 "human-readable privacy summary" UX on top of the new policy pack —
 * privacy-as-advantage is a core ETerapy promise, so it stays visible.
 */
export interface LegalDocIntro {
  heading: string;
  points: string[];
}

export const LEGAL_DOC_INTROS: Partial<Record<LegalDocSlug, LegalDocIntro>> = {
  privacy: {
    heading: "Коротко и по-человечески",
    points: [
      "Мы не продаём ваши данные и не используем их для рекламы.",
      "Данные граждан РФ обрабатываются и хранятся в России (152-ФЗ); основной AI-контур — Yandex, без трансграничной передачи.",
      "Содержимое разборов защищено; вы можете в любой момент удалить аккаунт и данные.",
      "Гостевые запросы без регистрации хранятся не дольше 72 часов, затем удаляются.",
    ],
  },
};

/** Source-pack documents that must never be published as public pages. */
export const INTERNAL_LEGAL_DOC_NUMBERS = [15, 16, 17, 19] as const;

const BY_SLUG = new Map<string, LegalDocMeta>(LEGAL_DOCUMENTS.map((doc) => [doc.slug, doc]));

export function getLegalDoc(slug: string): LegalDocMeta | undefined {
  return BY_SLUG.get(slug);
}

export function allLegalDocSlugs(): LegalDocSlug[] {
  return LEGAL_DOCUMENTS.map((doc) => doc.slug);
}

/**
 * Stable version identifier for a document, used by consent logs (B427) and the
 * payment offer-version binding (B424). Changing the pack version/date here
 * produces new identifiers, which is the intended behaviour on a full replacement.
 */
export function legalDocVersionId(slug: LegalDocSlug): string {
  const doc = BY_SLUG.get(slug);
  if (!doc) throw new Error(`Unknown legal document: ${slug}`);
  return `${slug}-v${doc.version}-${doc.publishedAt}`;
}
