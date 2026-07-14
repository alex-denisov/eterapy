export const SUBSCRIPTION_PLAN_LABELS: Record<string, string> = {
  plus: "Plus",
  premium: "Premium",
  start: "Legacy Start",
  deep: "Legacy Deep",
  accompaniment: "Legacy Accompaniment",
  practitioner_pro: "Practitioner Pro",
  practitioner_pro_plus: "Practitioner Pro+",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIALING: "Пробный период",
  ACTIVE: "Активна",
  PAST_DUE: "Требует оплаты",
  CANCELLED: "Отменена",
  EXPIRED: "Истекла",
};

// Russian display names, aligned with the public catalog (lib/v5-products.ts).
export const PRODUCT_LABELS: Record<string, string> = {
  reframe: "Переосмысление",
  "deep-report": "Подробный разбор",
  "full-question": "Полный разбор вопроса",
  "chat-analysis": "Разбор переписки",
  compatibility: "Совместимость",
  circle: "Круг",
  pair: "Разобраться вдвоём",
  tarot: "Расклад Таро",
  "natal-chart": "Натальная карта",
  "family-scenarios": "Семейные сценарии",
  "human-design": "Дизайн человека",
  "surname-story": "Кармический код фамилии",
  synastry: "Совместимость по звёздам",
  numerology: "Матрица судьбы",
  horary: "Хорарная астрология",
  "tarot-numerology": "Арканы рождения",
  perspectives: "Переосмысление",
  "seven-days": "Недельное резюме",
  "seven-days-report": "Недельное резюме",
  "seven-days-route": "Недельное резюме",
  "weekly-report": "Недельное резюме",
  "weekly-summary": "Недельное резюме",
  human_design: "Дизайн человека",
  natal: "Натальная карта",
  "product-reframe-v5": "Переосмысление",
};

// Credit-pack purchase descriptions, keyed by pack key (see lib/entitlements CREDIT_PACKS).
export const CREDIT_PACK_LABELS: Record<string, string> = {
  "pack-5": "Пакет 5 баллов",
  "pack-10": "Пакет 10 баллов",
  "pack-25": "Пакет 25 баллов",
};

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  TOP_UP: "Пополнение баланса",
  SPEND: "Списание",
  PRODUCT_PURCHASE: "Покупка продукта",
  SUBSCRIPTION_CHARGE: "Оплата подписки",
  REFUND: "Возврат",
  CREDIT: "Начисление",
  DEBIT: "Списание",
  REWARD: "Бонус",
};

export function getSubscriptionPlanLabel(planKey: string | null | undefined): string {
  return planKey ? SUBSCRIPTION_PLAN_LABELS[planKey] ?? planKey : "Бесплатный";
}

export function getSubscriptionStatusLabel(status: string | null | undefined): string {
  return status ? SUBSCRIPTION_STATUS_LABELS[status] ?? status : "Нет активной подписки";
}

export function getProductLabel(productKey: string): string {
  const normalized = productKey
    .trim()
    .replace(/^product[-_\s]+/i, "")
    .replaceAll("_", "-")
    .replace(/\s+/g, "-")
    .replace(/[-\s]?v\d+$/i, "")
    .toLowerCase();
  return PRODUCT_LABELS[normalized] ?? productKey;
}

export function getLedgerTypeLabel(type: string): string {
  return LEDGER_TYPE_LABELS[type] ?? type;
}

/**
 * Turn a raw billing description into a human-readable Russian service name.
 * Handles the machine descriptions produced at checkout, e.g. "ETerapy: tarot"
 * -> "Расклад Таро", credit packs and subscription periods. Falls back to the
 * original text for anything already human-written.
 */
export function humanizeBillingDescription(description: string | null | undefined): string {
  if (!description || !description.trim()) return "Операция";
  const text = description.trim();

  // "ETerapy: <productKey|packKey>" — the machine description from checkout.
  const keyed = text.match(/^ETerapy:\s*([a-z0-9-]+)$/i);
  if (keyed) {
    const key = keyed[1].toLowerCase();
    if (PRODUCT_LABELS[key]) return PRODUCT_LABELS[key];
    if (CREDIT_PACK_LABELS[key]) return CREDIT_PACK_LABELS[key];
  }

  // "ETerapy <Plan>: первый период" — subscription first charge.
  const plan = text.match(/^ETerapy\s+(.+?):/i);
  if (plan) return `Подписка ${plan[1].trim()}`;

  // Bare productKey (some older rows stored just the key).
  if (PRODUCT_LABELS[text]) return PRODUCT_LABELS[text];
  if (CREDIT_PACK_LABELS[text]) return CREDIT_PACK_LABELS[text];

  return text;
}
