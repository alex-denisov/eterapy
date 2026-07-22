/**
 * Тело запроса на оплату из ключа предложения витрины мини-аппа.
 *
 * Ключи витрины ПРЕФИКСОВАНЫ видом покупки (`credits:pack-10`, `plan:premium`,
 * `service:<productKey>` — см. `journey-data.ts`), а прейскурант знает их без
 * префикса. Разбор живёт в одном месте: рельсов теперь два (карта и звёзды), и
 * две копии этого правила разъехались бы на первой же правке каталога.
 *
 * Модуль намеренно БЕЗ разметки и CSS: его импортирует тест, а импорт экрана
 * тянет за собой `miniapp-v21.module.css`, который jest разобрать не может
 * (тот же принцип, что и в `miniapp-context.ts`).
 */
export type PurchaseOffer = {
  key: string;
  kind: string;
};

export function purchaseBodyFor(offer: PurchaseOffer, source: string) {
  const returnPath = `/miniapp/checkout/review?offer=${encodeURIComponent(offer.key)}`;
  const unprefixed = (prefix: string) =>
    offer.key.startsWith(prefix) ? offer.key.slice(prefix.length) : offer.key;

  if (offer.kind === "credits") return { creditPackKey: unprefixed("credits:"), checkoutSource: source, returnPath };
  if (offer.kind === "subscription") return { planKey: unprefixed("plan:"), checkoutSource: source, returnPath };
  return { productKey: unprefixed("service:"), checkoutSource: source, returnPath };
}
