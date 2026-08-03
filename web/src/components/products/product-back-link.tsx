"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * B647: стрелка «назад» на странице услуги вела жёстко на `/`, поэтому переход
 * `/products` → услуга → «назад» выбрасывал на главную и терял место, с
 * которого пользователь выбирал услугу.
 *
 * Возврат по истории решает обе половины сразу: адрес берётся настоящий, а
 * позицию прокрутки восстанавливает сам роутер. Но `router.back()` в лоб
 * опасен: на странице, открытой прямой ссылкой из поиска, единственный шаг
 * назад уводит с сайта. Отличить одно от другого позволяет `idx` — счётчик
 * шага, который App Router кладёт в `history.state` при каждой своей
 * навигации. `idx > 0` значит «до этой страницы внутри сайта уже что-то было».
 */
export function ProductBackLink({
  fallback = "/products",
  className,
  label = "Назад",
}: {
  fallback?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    // Обычная ссылка, а не <Link>: без JS и до гидратации она обязана вести на
    // каталог, и префетч здесь не нужен — по ней уходят в обратную сторону.
    <a
      href={fallback}
      aria-label={label}
      data-testid="product-hero-back"
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        // Не перехватываем открытие в новой вкладке и средний клик.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        const step = (window.history.state as { idx?: unknown } | null)?.idx;
        if (typeof step !== "number" || step <= 0) return;
        event.preventDefault();
        router.back();
      }}
    >
      <ChevronLeft className="size-5" aria-hidden="true" />
    </a>
  );
}
