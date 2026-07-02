// B464 IB6 (owner round-3 #8) — the Apple-style support gate data. Search FAQ
// first; escalate by problem type. Live chat is offered ONLY for the six
// sensitive categories; everything else routes to email + web form.

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
