import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ServiceGuide } from "@/lib/service-guides";

/**
 * B648 · Корпус услуги внутри записи библиотеки.
 *
 * ⚠ Разметка намеренно повторяет «единое полотно» карточки библиотеки, а не
 * прежний блок со страницы услуги: там текст жил в цветных карточках-плитках,
 * потому что был приложением к инструменту. Здесь он основной материал
 * страницы и читается как статья.
 *
 * FAQ-разметка (`FAQPage`) на этой странице УЖЕ есть — она строится из
 * `entry.faqs` в самом маршруте. Второй такой же скрипт добавлять нельзя:
 * дублирующая разметка на одной странице — прямой повод для Google её
 * проигнорировать.
 */
export function ServiceGuideSections({
  guide,
  serviceHref,
  serviceName,
}: {
  guide: ServiceGuide;
  serviceHref: string | null;
  serviceName: string | null;
}) {
  return (
    <section className="soft-library-canvas mt-12 max-w-3xl" data-testid="library-service-guide">
      <hr className="mb-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">когда формат особенно полезен</p>
        <ul className="mt-5 space-y-3">
          {guide.usefulFor.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--soft-terracotta)]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">как проходит разбор</p>
        <ol className="mt-5 space-y-5">
          {guide.process.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-xs font-semibold text-[var(--soft-bordeaux)]">
                {index + 1}
              </span>
              <div className="pt-0.5">
                <h3 className="font-semibold text-[var(--soft-ink)]">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">{guide.interpretationTitle.toLocaleLowerCase("ru-RU")}</p>
        <ul className="mt-5 space-y-3">
          {guide.interpretation.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--soft-sage)]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">с чем сюда приходят</p>
        <ul className="mt-5 space-y-3">
          {guide.examples.map((item) => (
            <li
              key={item}
              className="text-base italic leading-relaxed text-[var(--soft-bordeaux)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              «{item}»
            </li>
          ))}
        </ul>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      {/* Граница формата стоит ДО призыва открыть услугу, а не после неё:
          человек должен прочитать, чего услуга не делает, прежде чем платить. */}
      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">чего этот формат не делает</p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{guide.boundary}</p>
      </div>

      <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

      <div>
        <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">частые вопросы</p>
        <dl className="mt-5 space-y-6">
          {guide.faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold text-[var(--soft-ink)]">{faq.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{faq.answer}</dd>
            </div>
          ))}
        </dl>
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

      {serviceHref && serviceName && (
        <p className="mt-9 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Разобрать свою ситуацию в этом формате —{" "}
          <Link href={serviceHref} className="font-semibold text-[var(--soft-bordeaux)] underline underline-offset-2">
            {serviceName}
          </Link>
          .
        </p>
      )}
    </section>
  );
}
