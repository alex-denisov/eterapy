"use client";

import { useSession } from "next-auth/react";
import { formatPoints } from "@/lib/points";
import type { V5Product } from "@/lib/v5-products";

// B405: цена в шапке услуги — role-aware.
//  • Гость (и пока сессия грузится) видит цену в ₽ — как раньше (B395), что
//    совпадает со статически отрендеренной разметкой → без скачка гидрации.
//  • Авторизованный пользователь тратит баллы, поэтому ему показываем СТОИМОСТЬ
//    В БАЛЛАХ крупно, а денежную цену — мелким вторичным текстом под ней.
//    Когда баллы кончатся, оплата картой/докупка живут в воронке (B402).
// Свободные услуги без creditCost показывают только ₽ обоим.
export function ProductHeroPrice({ product }: { product: V5Product }) {
  const { status } = useSession();
  const authed = status === "authenticated";
  const showPoints = authed && typeof product.creditCost === "number" && product.creditCost > 0;

  if (showPoints) {
    return (
      <span
        className="flex shrink-0 flex-col items-end rounded-2xl px-3.5 py-1.5 leading-none text-[var(--soft-bordeaux)]"
        style={{ background: "var(--soft-apricot)" }}
        data-testid="product-hero-price"
      >
        <span className="text-lg font-semibold">{formatPoints(product.creditCost as number)}</span>
        <span className="mt-0.5 text-[10.5px] font-medium opacity-65">или {product.price}</span>
      </span>
    );
  }

  return (
    <span
      className="shrink-0 rounded-full px-3.5 py-1.5 text-lg font-semibold leading-none text-[var(--soft-bordeaux)]"
      style={{ background: "var(--soft-apricot)" }}
      data-testid="product-hero-price"
    >
      {product.price}
    </span>
  );
}
