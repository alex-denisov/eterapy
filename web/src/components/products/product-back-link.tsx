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
 * опасен: во вкладке, открытой прямой ссылкой из поиска, единственный шаг
 * назад уводит с сайта совсем.
 *
 * ⚠ Проверять `history.state.idx` здесь НЕЛЬЗЯ, хотя соблазн есть: `idx` —
 * счётчик Pages Router, в App Router его нет вовсе (проверено по
 * `next/dist/client/components/app-router.js`, next 16.2.6). Условие на него
 * не выполнилось бы никогда, и стрелка молча деградировала бы в обычную
 * ссылку на каталог — без восстановления прокрутки и без настоящего «назад».
 *
 * Прочитать предыдущую запись истории браузер не даёт в принципе, поэтому
 * работаем по единственному честному признаку: `history.length > 1` значит
 * «во вкладке есть куда возвращаться». Свежая вкладка, открытая сразу на
 * услуге, даёт 1 — там уходим на каталог. Это ровно то поведение, которого
 * человек ждёт от стрелки «назад».
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
        if (window.history.length <= 1) return;
        event.preventDefault();
        router.back();
      }}
    >
      <ChevronLeft className="size-5" aria-hidden="true" />
    </a>
  );
}
