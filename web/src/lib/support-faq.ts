// B464 IB6 (owner round-3 #8) — the Apple-style support gate data. Search FAQ
// first; escalate by problem type. Live chat is offered ONLY for the six
// sensitive categories; everything else routes to email + web form.

import { HELP_FAQS, type HelpFaqItem } from "@/lib/help-faq-data";

export interface FaqEntry {
  id: string;
  q: string;
  a: string;
  keywords: string[];
}

export interface SupportCategory {
  id: string;
  label: string;
  /** Whether «написать в чат» (live Telegram-styled chat) is offered. */
  liveChat: boolean;
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  { id: "finance", label: "Финансы и оплата", liveChat: true },
  { id: "refunds", label: "Возвраты", liveChat: true },
  { id: "cancellations", label: "Отмена сессий и платежей", liveChat: true },
  { id: "privacy", label: "Приватность данных", liveChat: true },
  { id: "specialist", label: "Поведение специалиста", liveChat: true },
  { id: "account", label: "Доступ к аккаунту", liveChat: true },
  { id: "product", label: "Как работают разборы", liveChat: false },
  { id: "technical", label: "Технические проблемы", liveChat: false },
  { id: "other", label: "Другое", liveChat: false },
];

export function categoryAllowsChat(id: string): boolean {
  return SUPPORT_CATEGORIES.find((c) => c.id === id)?.liveChat ?? false;
}

// B464 round-4 #18 — support theme → help-centre FAQ categories, so a picked
// theme surfaces 5 random questions from the shared knowledge base.
const SUPPORT_TO_HELP_CATS: Record<string, string[]> = {
  finance: ["payments"],
  refunds: ["payments"],
  cancellations: ["payments", "specialists"],
  privacy: ["privacy"],
  specialist: ["specialists"],
  account: ["account", "privacy"],
  product: ["product", "esoteric"],
  technical: ["product", "account"],
  other: [],
};

/**
 * Round-5 #13: полный детерминированный список вопросов темы. Аккордеон
 * показывает первые 5 и ДОБАВЛЯЕТ следующие по «Показать ещё вопросы» —
 * вместо случайной перетасовки, которая просто перелистывала пятёрки.
 */
export function listThemeQuestions(
  categoryId: string,
  faqs: ReadonlyArray<HelpFaqItem> = HELP_FAQS,
): HelpFaqItem[] {
  const cats = SUPPORT_TO_HELP_CATS[categoryId] ?? [];
  return cats.length > 0 ? faqs.filter((f) => cats.includes(f.cat)) : [...faqs];
}

/**
 * Pick `count` random questions for a support theme from the help-centre base.
 * The rng is injectable so tests stay deterministic; UI uses Math.random.
 */
export function pickThemeQuestions(
  categoryId: string,
  count = 5,
  rng: () => number = Math.random,
  faqs: ReadonlyArray<HelpFaqItem> = HELP_FAQS,
): HelpFaqItem[] {
  const cats = SUPPORT_TO_HELP_CATS[categoryId] ?? [];
  const pool = cats.length > 0 ? faqs.filter((f) => cats.includes(f.cat)) : [...faqs];
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export const SUPPORT_FAQ: FaqEntry[] = [
  {
    id: "credits",
    q: "Что такое баллы и как они списываются?",
    a: "Баллы — внутренняя валюта. Разбор стоит несколько баллов; они списываются в момент, когда вы открываете платный разбор. Баланс виден в Кошельке.",
    keywords: ["баллы", "оплата", "списание", "кошелёк", "стоимость", "цена"],
  },
  {
    id: "refund",
    q: "Можно ли вернуть деньги за покупку?",
    a: "Цифровые разборы возврату не подлежат после генерации. Если платёж не прошёл или списался дважды — напишите нам, разберёмся.",
    keywords: ["возврат", "деньги", "refund", "вернуть", "списали дважды"],
  },
  {
    id: "cancel",
    q: "Как отменить запись к специалисту?",
    a: "Отменить запись можно в разделе «Записи», пока до сессии больше 24 часов и она ещё не подтверждена. Позже — напишите в поддержку.",
    keywords: ["отмена", "запись", "сессия", "отменить", "специалист", "перенести"],
  },
  {
    id: "privacy",
    q: "Кто видит мои разборы и записи?",
    a: "Только вы. Дневник и разборы приватны; в библиотеку попадает лишь то, на что вы дали явное согласие. Дневник можно закрыть PIN-кодом.",
    keywords: ["приватность", "данные", "дневник", "конфиденциальность", "pin", "видит"],
  },
  {
    id: "login",
    q: "Не получается войти в аккаунт",
    a: "Проверьте способ входа (почта или соцсеть), которым регистрировались. Если доступ потерян — напишите нам с почты аккаунта.",
    keywords: ["вход", "аккаунт", "логин", "доступ", "пароль", "войти"],
  },
  {
    id: "subscription",
    q: "Как отменить подписку?",
    a: "В Кошельке → «Подписка» нажмите «Отменить». Подписка останется активной до конца оплаченного периода.",
    keywords: ["подписка", "отменить", "plus", "premium", "тариф"],
  },
];

export function searchFaq(query: string, faq: ReadonlyArray<FaqEntry> = SUPPORT_FAQ): FaqEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return faq.filter((e) => {
    const hay = `${e.q} ${e.a} ${e.keywords.join(" ")}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}
