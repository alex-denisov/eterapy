import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="not-found-page">
      <section className="soft-shell flex min-h-[70vh] flex-col items-center justify-center py-16 text-center md:py-24">
        <div
          className="soft-card mx-auto max-w-xl p-10 md:p-12"
          style={{ background: "linear-gradient(160deg, #fffcf5, #f4d9c1)" }}
        >
          <p className="soft-eyebrow">страница не найдена</p>
          <h1 className="soft-h1 mt-3">
            Эта страница <span className="soft-italic">сейчас не открывается</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--soft-ink-soft)]">
            Возможно, ссылка устарела или раздел переехал. Самые надёжные точки
            входа — главная и бесплатный разбор.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="soft-button soft-button-primary">
              На главную
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/checkin" className="soft-button soft-button-ghost">
              <Compass className="size-4" aria-hidden="true" />
              Начать диалог
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
