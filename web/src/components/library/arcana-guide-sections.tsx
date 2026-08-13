import Link from "next/link";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import type { ArcanaGuide } from "@/lib/arcana";

/**
 * B710 · Справочный корпус аркана внутри записи библиотеки.
 *
 * ⚠ FAQ здесь НЕ рендерится. Блок «Частые вопросы» и разметку `FAQPage` строит
 * сам маршрут записи из `entry.faqs`. Второй такой же блок дал бы и дубль на
 * экране, и дублирующую разметку на странице — прямой повод её проигнорировать
 * (тот же урок, что и в B648).
 *
 * ⚠ Разметка повторяет «единое полотно» карточки библиотеки, а не плитки
 * страницы услуги: здесь текст — основной материал страницы, а не приложение
 * к инструменту.
 */
export function ArcanaGuideSections({ guide }: { guide: ArcanaGuide }) {
  return (
    <section className="soft-library-canvas mt-12 max-w-3xl" data-testid="library-arcana-guide">
      <hr className="mb-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div>
        <h2 className="soft-h3">{guide.heading}</h2>
        <p className="mt-4 text-base leading-relaxed text-[var(--soft-ink-soft)]">{guide.answer}</p>
        <ul className="mt-5 space-y-3">
          {guide.essence.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--soft-sage)]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      {/* «N аркан в плюсе» и «в минусе» — так эту энергию и ищут. Обе стороны
          стоят рядом намеренно: у аркана нет «хорошего» и «плохого» полюса,
          есть проявленное и искажённое. */}
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">
            {guide.number} аркан в плюсе
          </p>
          <ul className="mt-5 space-y-3">
            {guide.strengths.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--soft-sage)]" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">
            {guide.number} аркан в минусе
          </p>
          <ul className="mt-5 space-y-3">
            {guide.distortions.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                <TriangleAlert className="mt-1 size-4 shrink-0 text-[var(--soft-terracotta)]" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">в позициях матрицы</p>
        <dl className="mt-5 space-y-6">
          {guide.positions.map((position) => (
            <div key={position.title}>
              <dt className="font-semibold text-[var(--soft-ink)]">{position.title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{position.text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">
            {guide.number} аркан на год
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{guide.year}</p>
        </div>
        <div>
          <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">
            {guide.number} аркан в совместимости
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{guide.compatibility}</p>
        </div>
      </div>

      {guide.confusion && (
        <>
          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />
          <div>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">почему в источниках разные номера</p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{guide.confusion}</p>
          </div>
        </>
      )}

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      {/* Граница трактовки стоит ДО призыва открыть расчёт, а не после него. */}
      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">чего эта трактовка не делает</p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{guide.boundary}</p>
      </div>

      {guide.related.length > 0 && (
        <>
          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />
          <div>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">рядом по теме</p>
            <ul className="mt-5 space-y-2.5">
              {guide.related.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-bordeaux)] underline underline-offset-2"
                  >
                    {item.label}
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
