"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { log } from "@/lib/logger";

// Branded error boundary for the product detail route. Без него любой сбой
// рендера (например, битые/очень старые данные результата) обрушивал страницу
// в стандартный чёрный экран Next «This page couldn't load». Теперь сбой
// деградирует мягко в стиле Soft Clarity, с понятным действием.
export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error("product-page-render-error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="product-error-boundary">
      <section className="soft-shell flex min-h-[70vh] flex-col items-center justify-center py-16 text-center md:py-24">
        <div
          className="soft-card mx-auto max-w-xl p-10 md:p-12"
          style={{ background: "linear-gradient(160deg, #fffcf5, #f4d9c1)" }}
        >
          <p className="soft-eyebrow">что-то пошло не так</p>
          <h1 className="soft-h1 mt-3">
            Страница <span className="soft-italic">не открылась с первого раза</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--soft-ink-soft)]">
            Иногда так бывает с сохранёнными результатами. Попробуйте обновить —
            обычно этого достаточно. Ваши данные в безопасности.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className="soft-button soft-button-primary">
              <RotateCcw className="size-4" aria-hidden="true" />
              Обновить
            </button>
            <Link href="/products" className="soft-button soft-button-ghost">
              Все форматы
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
