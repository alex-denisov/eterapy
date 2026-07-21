"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Coins, CreditCard, Loader2 } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";
import { pointsWord } from "@/lib/points";
import { dispatchBalanceChanged } from "@/lib/balance-events";
import { toMiniAppPath } from "@/lib/miniapp/navigation";
// Именно из `miniapp-context`, а не из шелла: шелл тянет CSS-модуль, который
// ломает jest-прогон соседних продуктовых тестов.
import { useMiniAppV21Optional } from "@/components/miniapp/miniapp-context";

type ProductPurchaseControlsProps = {
  productKey: string;
  label: string;
  checkoutSource: string;
  creditCost?: number | null;
  className?: string;
  variant?: "default" | "catalog";
  onUnlocked?: () => void;
  /**
   * B554 п.25: проверка обязательных полей ДО оплаты. Возвращает текст
   * предупреждения или null. Без неё «Открыть за баллы» списывало баллы при
   * пустой форме и только потом просило заполнить поля.
   */
  beforePay?: () => string | null;
};

async function jsonRequest<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? payload.message ?? "Не удалось выполнить действие");
    (error as Error & { status?: number; payload?: unknown }).status = response.status;
    (error as Error & { status?: number; payload?: unknown }).payload = payload;
    throw error;
  }
  return payload as T;
}

// Z1-Ф1: the client ₽ balance rail is gone. Digital products are opened with
// clarity credits (primary) or paid directly by card (fallback). Sessions and
// subscriptions are the card-only rails handled elsewhere.
export function ProductPurchaseControls({
  productKey,
  label,
  checkoutSource,
  creditCost,
  className,
  variant = "default",
  onUnlocked,
  beforePay,
}: ProductPurchaseControlsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const cardReturnHandledRef = useRef(false);
  const [action, setAction] = useState<"idle" | "credits" | "card">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const search = searchParams.toString();
  const currentUrl = `${pathname}${search ? `?${search}` : ""}`;
  const inMiniApp = pathname.startsWith("/miniapp");
  // B554 п.27 + B423: в мини-аппе кнопка не должна обещать оплату, которой ещё
  // нет — иначе она уводит с заполненной формы в тупик «скоро». Флаг приходит с
  // сервера вместе с остальными данными мини-аппа; в вебе контекста нет и
  // карточный путь работает как раньше.
  const miniAppCardReady = useMiniAppV21Optional()?.data.cardPaymentEnabled ?? false;
  const paymentStatus = searchParams.get("payment");
  const returnedProductKey = searchParams.get("productKey");
  const busy = status === "loading" || action !== "idle";
  const hasCredits = typeof creditCost === "number" && creditCost > 0;

  useEffect(() => {
    if (status !== "authenticated") return;
    if (cardReturnHandledRef.current) return;
    if (paymentStatus !== "success" || returnedProductKey !== productKey) return;

    cardReturnHandledRef.current = true;
    let cancelled = false;

    async function reconcileCardReturn() {
      setMessage("Подтверждаем оплату и открываем доступ...");

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const reconcile = await fetch("/api/billing/reconcile", { method: "POST" })
            .then((response) => response.json())
            .catch(() => null) as {
              results?: Array<{ outcome?: string; message?: string | null }>;
            } | null;
          const declined = reconcile?.results?.find((result) => result.outcome === "cancelled" && result.message);
          if (declined?.message) {
            setMessage(declined.message);
            return;
          }
          const entitlement = await fetch(`/api/billing/entitlements?productKey=${encodeURIComponent(productKey)}`)
            .then((response) => response.json())
            .catch(() => null) as { active?: boolean } | null;

          if (cancelled) return;
          if (entitlement?.active) {
            setMessage("Доступ открыт. Можно пользоваться услугой на этой странице.");
            onUnlocked?.();
            return;
          }
        } catch {
          // YooKassa webhook can lag behind the browser return; retry below.
        }

        if (attempt < 5) {
          await new Promise((resolve) => { setTimeout(resolve, 2000); });
        }
      }

      if (!cancelled) {
        setMessage("Платёж ещё обрабатывается. Обновите страницу через минуту или откройте раздел оплаты.");
      }
    }

    void reconcileCardReturn();
    return () => { cancelled = true; };
  }, [onUnlocked, paymentStatus, productKey, returnedProductKey, status]);

  /** Общий вход в оплату: без заполненных полей платить не за что. */
  function blockedByInput(): boolean {
    const warning = beforePay?.();
    if (warning) {
      setMessage(warning);
      return true;
    }
    return false;
  }

  async function payWithCredits() {
    if (blockedByInput()) return;
    setAction("credits");
    setMessage(null);
    try {
      await jsonRequest("/api/billing/spend-credits", { productKey });
      // #3: header credit pill updates immediately after the spend.
      dispatchBalanceChanged();
      onUnlocked?.();
      setMessage("Доступ открыт за баллы.");
    } catch (error) {
      // B554 п.25: раньше к ЛЮБОМУ отказу приклеивалось «Можно оплатить
      // картой», и при пустом теле ответа получалось бессодержательное
      // «Не удалось выполнить действие. Можно оплатить картой.» Карту
      // предлагаем только там, где она действительно выход — когда не хватило
      // баллов; остальные отказы называем своим текстом.
      const typed = error as Error & { status?: number };
      const text = error instanceof Error && error.message ? error.message : "";
      if (typed.status === 402) {
        setMessage(`${text || "Не хватает баллов"}. Можно оплатить картой.`);
      } else if (typed.status === 401) {
        setMessage("Сессия истекла. Войдите в аккаунт и попробуйте ещё раз.");
      } else {
        setMessage(text || "Не получилось списать баллы. Попробуйте ещё раз через минуту.");
      }
    } finally {
      setAction("idle");
    }
  }

  async function payWithCard() {
    if (blockedByInput()) return;
    if (inMiniApp) {
      window.location.href = `/miniapp/checkout/review?offer=${encodeURIComponent(`service:${productKey}`)}`;
      return;
    }
    setAction("card");
    setMessage(null);
    try {
      const payload = await jsonRequest<{ confirmationUrl?: string }>("/api/billing/create-payment", {
        productKey,
        checkoutSource,
        returnPath: currentUrl,
      });
      if (payload.confirmationUrl) {
        window.location.href = payload.confirmationUrl;
        return;
      }
      throw new Error("Платежная ссылка не получена");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось открыть оплату");
      setAction("idle");
    }
  }

  if (status === "unauthenticated") {
    return (
      <Link
        href={inMiniApp
          ? `/miniapp/account?mode=login&intent=buy-product&productKey=${encodeURIComponent(productKey)}&returnTo=${encodeURIComponent(currentUrl)}`
          : `/login?next=${encodeURIComponent(currentUrl)}&intent=buy-product&productKey=${encodeURIComponent(productKey)}`}
        className={cn("soft-button soft-button-primary", className)}
        data-analytics-event="direct_product_login_clicked"
        data-analytics-product={productKey}
      >
        {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  const creditsLabel = hasCredits ? `${label} · ${creditCost} ${pointsWord(creditCost as number)}` : label;
  const messageBlock = message && (
    <p className="mt-2 text-xs leading-relaxed text-[var(--soft-bordeaux)]" role={message.includes("Недостаточно") || message.includes("Не удалось") ? "alert" : "status"}>
      {message}{" "}
      {message.includes("балл") && (
        <Link href={inMiniApp ? toMiniAppPath(appUrl("/wallet")) : appUrl("/wallet")} prefetch={false} className="font-semibold underline">
          Пополнить баллы
        </Link>
      )}
    </p>
  );

  if (variant === "catalog") {
    return (
      <div className="soft-product-purchase-controls min-w-0" data-testid={`product-purchase-${productKey}`}>
        <div className="flex flex-wrap items-center gap-2">
          {hasCredits ? (
            <>
              <button
                type="button"
                className={cn("soft-button soft-button-primary", className)}
                disabled={busy}
                onClick={payWithCredits}
                title={`Открыть за баллы: ${creditCost}`}
                data-analytics-event="credits_spend_clicked"
                data-analytics-product={productKey}
                data-analytics-checkout-source={checkoutSource}
              >
                {action === "credits" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Coins className="size-4" aria-hidden="true" />}
                {action === "credits" ? "Открываем" : creditsLabel}
              </button>
              <button
                type="button"
                className="soft-chip h-9 justify-center px-3"
                disabled={busy}
                onClick={payWithCard}
                title="Оплатить картой"
                aria-label="Оплатить картой"
                data-analytics-event="direct_product_checkout_clicked"
                data-analytics-product={productKey}
                data-analytics-checkout-source={checkoutSource}
              >
                {action === "card" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={cn("soft-button soft-button-primary", className)}
              disabled={busy}
              onClick={payWithCard}
              data-analytics-event="direct_product_checkout_clicked"
              data-analytics-product={productKey}
              data-analytics-checkout-source={checkoutSource}
            >
              {action === "card" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
              {action === "card" ? "Открываем оплату" : label}
            </button>
          )}
        </div>
        {messageBlock}
      </div>
    );
  }

  // Round-5 #4: на телефоне подпись основной кнопки схлопывается до
  // «Открыть за N баллов», чтобы пара кнопок была компактнее.
  // B554 (owner): держать пару в одной строке ЛЮБОЙ ценой было ошибкой — на
  // 344px «Открыть за 3 балла» обрезалось на 57px. Базис ниже — это ширина, при
  // которой подпись ещё помещается целиком; если вторая кнопка в остаток не
  // влезает, она переносится на свою строку (см. .soft-purchase-row).
  const mobileCreditsLabel = hasCredits
    ? `Открыть за ${creditCost} ${pointsWord(creditCost as number)}`
    : label;

  return (
    <div className="soft-product-purchase-controls" data-testid={`product-purchase-${productKey}`}>
      <div className={hasCredits ? "soft-purchase-row" : "flex flex-wrap gap-2"}>
        {hasCredits && (
          <button
            type="button"
            className={cn("soft-button soft-button-primary basis-[13.5rem] justify-center", className)}
            disabled={busy}
            onClick={payWithCredits}
            data-analytics-event="credits_spend_clicked"
            data-analytics-product={productKey}
            data-analytics-checkout-source={checkoutSource}
          >
            {action === "credits" ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <Coins className="size-4 shrink-0" aria-hidden="true" />}
            {action === "credits" ? "Списываем баллы" : (
              <>
                <span className="min-w-0 truncate sm:hidden">{mobileCreditsLabel}</span>
                <span className="hidden min-w-0 truncate sm:inline">{creditsLabel}</span>
              </>
            )}
          </button>
        )}
        <button
          type="button"
          className={cn(hasCredits ? "soft-button soft-button-ghost" : "soft-button soft-button-primary", !hasCredits ? className : undefined)}
          disabled={busy}
          onClick={payWithCard}
          data-analytics-event="direct_product_checkout_clicked"
          data-analytics-product={productKey}
          data-analytics-checkout-source={checkoutSource}
        >
          {action === "card" ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4 shrink-0" aria-hidden="true" />}
          {/* B554 п.27: в мини-аппе оплата картой ещё не подключена — экран
              проверки честно говорит «скоро». Кнопка на самой услуге обещала
              оплату, уводила с заполненной формы и упиралась в тупик. */}
          {action === "card" ? "Открываем оплату" : inMiniApp && !miniAppCardReady ? "Картой — скоро" : hasCredits ? "Картой" : label}
        </button>
      </div>
      {messageBlock}
    </div>
  );
}
