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

export const PRODUCT_LABELS: Record<string, string> = {
  perspectives: "Перспективы",
  "deep-report": "Глубокий отчёт",
  "chat-analysis": "Разбор переписки",
  compatibility: "Совместимость",
  circle: "Круг отношений",
  pair: "Парный разбор",
  "seven-days": "7 дней к ясности",
  "my-map": "Моя карта",
  tarot: "Расклад Таро",
  "natal-chart": "Натальная карта",
  synastry: "Синастрия",
  numerology: "Числовой портрет",
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
  return PRODUCT_LABELS[productKey] ?? productKey;
}

export function getLedgerTypeLabel(type: string): string {
  return LEDGER_TYPE_LABELS[type] ?? type;
}
