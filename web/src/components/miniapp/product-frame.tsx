"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKey, Sparkle } from "@phosphor-icons/react";
import type { MouseEvent, ReactNode } from "react";
import type { V5Product } from "@/lib/v5-products";
import { toMiniAppPath } from "@/lib/miniapp/navigation";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";

function MiniAppNavigationBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();

  function keepInsideMiniApp(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const rawHref = anchor.getAttribute("href");
    if (!rawHref) return;
    const mapped = toMiniAppPath(rawHref);
    if (mapped === rawHref || !mapped.startsWith("/miniapp")) return;
    event.preventDefault();
    event.stopPropagation();
    router.push(mapped);
  }

  return <div className={styles["product-action-boundary"]} onClickCapture={keepInsideMiniApp}>{children}</div>;
}

export function MiniAppProductFrame({
  title,
  eyebrow,
  price,
  priceMeta,
  children,
  back = "/miniapp/services",
}: {
  title: string;
  eyebrow: string;
  price: string;
  priceMeta?: string;
  children: ReactNode;
  back?: string;
}) {
  const { data } = useMiniAppV21();
  return (
    <MiniAppChrome data={data}>
      <article className={styles["product-native-page"]} data-testid="miniapp-product-page">
        <header className={styles["product-native-head"]}>
          <Link href={back} aria-label="Назад к услугам"><ArrowLeft size={18} /></Link>
          <div><small>{eyebrow}</small><h1>{title}</h1></div>
          <div className={styles["product-native-price"]}><strong>{price}</strong>{priceMeta ? <span>{priceMeta}</span> : null}</div>
        </header>
        <p className={styles["product-native-trust"]}><LockKey size={15} />Приватно · результат остаётся в вашем Дневнике</p>
        <MiniAppNavigationBoundary>{children}</MiniAppNavigationBoundary>
        <p className={styles["product-native-footnote"]}><Sparkle size={15} />Это инструмент для рефлексии, а не медицинская, юридическая или финансовая консультация.</p>
      </article>
    </MiniAppChrome>
  );
}

export function MiniAppConfiguredProductFrame({ product, children }: { product: V5Product; children: ReactNode }) {
  return (
    <MiniAppProductFrame
      title={product.name}
      eyebrow={product.eyebrow}
      price={product.price}
      priceMeta={product.creditPrice ?? product.priceMeta}
    >
      {children}
    </MiniAppProductFrame>
  );
}
