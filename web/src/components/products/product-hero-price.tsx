import Link from "next/link";
import type { V5Product } from "@/lib/v5-products";

// B656 (решение владельца 2026-08-04): цена в шапке услуги называется деньгами,
// а не внутренней валютой.
//
// ⚠ ЧТО ИМЕННО ИЗМЕНИЛОСЬ И ПОЧЕМУ. До этого шапка была role-aware (B405):
// авторизованному крупно показывалась стоимость В БАЛЛАХ, а ₽ уходили в мелкий
// вторичный текст. «1 балл» ничего не сообщает человеку, который видит сайт
// впервые: он не знает ни цены балла, ни откуда балл берётся. Теперь у всех
// одинаково — живая цена крупно и маршрут в подписку ссылкой.
//
// Баллы из продукта НЕ исчезли: сколько спишется, написано на самой кнопке
// оплаты (`ProductPurchaseControls`), то есть ровно там, где происходит
// списание. Шапка — это ответ на вопрос «сколько это стоит», а не выписка.
//
// Побочный выигрыш: компонент перестал зависеть от сессии, поэтому исчез и
// класс ошибок «скачок гидрации на цене» — разметка одна для всех.
export function ProductHeroPrice({ product }: { product: V5Product }) {
  // Услуга без стоимости в баллах в подписку не входит — обещать её нельзя.
  const inSubscription = typeof product.creditCost === "number" && product.creditCost > 0;

  return (
    <span
      className="flex shrink-0 flex-col items-end rounded-2xl px-3.5 py-1.5 leading-none text-[var(--soft-bordeaux)]"
      style={{ background: "var(--soft-apricot)" }}
      data-testid="product-hero-price"
    >
      <span className="text-lg font-semibold">{product.price}</span>
      {inSubscription && (
        <span className="mt-0.5 text-[10.5px] font-medium opacity-75">
          или{" "}
          <Link href="/pricing" className="underline underline-offset-2" data-testid="product-hero-subscription-link">
            в подписке
          </Link>
        </span>
      )}
    </span>
  );
}
