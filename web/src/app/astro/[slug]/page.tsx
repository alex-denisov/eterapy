import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, ChevronLeft, CircleHelp, ShieldCheck, TriangleAlert } from "lucide-react";
import { canonicalUrl } from "@/lib/seo";
import { mainUrl } from "@/lib/subdomain";
import { ogImageUrl } from "@/lib/share";
import { signTransits } from "@/lib/astro/sign-transits";
import { formatDuration, formatTransitDate, formatTransitMoment } from "@/lib/astro/transit-format";
import {
  GRID_HUB_PATH,
  SIGN_AXES,
  cellByKeys,
  cellBySlug,
  planetPast,
  planetPossessive,
  resolvedCells,
  rowNeighbours,
  textGlyph,
  transitWindow,
  type ResolvedCell,
} from "@/lib/astro/cells";
import { SignFinder, type FinderTarget } from "@/components/astro/sign-finder";
import { JsonLdGraph } from "@/components/seo/json-ld-graph";

/**
 * B711 · Страница ячейки расчётной сетки «планета × знак».
 *
 * ⚠ ПОРЯДОК БЛОКОВ — НЕ ВКУСОВЩИНА. Первым идёт прямой ответ в 40–60 слов
 * (бриф извлекаемости B701), сразу за ним расчёт и таблица посчитанных
 * периодов. Именно эти два блока отличают сетку от пересказа чужого учебника:
 * трактовку можно списать, посчитанные интервалы — нет. Уводить их вниз
 * страницы значит терять и цитируемость, и смысл всей затеи.
 *
 * ⚠ ТАБЛИЦА СЧИТАЕТСЯ НА СБОРКЕ, а не в браузере и не по запросу: страница
 * статическая, эфемериды в бандл не едут (кроме куска, который калькулятор
 * подгружает по нажатию).
 */

export const dynamicParams = false;

/** Дата выпуска волны 1. Общая дата библиотеки была бы проверкой раньше выхода. */
const GRID_REVIEWED_AT = "2026-08-14";

export function generateStaticParams() {
  return resolvedCells().map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = cellBySlug(slug);
  if (!item) return {};
  const url = canonicalUrl(item.path);
  const ogImage = canonicalUrl(ogImageUrl("library"));
  return {
    title: item.metaTitle,
    description: item.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: item.metaTitle,
      description: item.metaDescription,
      url,
      siteName: "ETerapy",
      locale: "ru_RU",
      type: "article",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: item.metaTitle,
      description: item.metaDescription,
      images: [ogImage],
    },
  };
}

/** Строки таблицы периодов. Для быстрых светил показывается и час, не только дата. */
function transitRows(item: ResolvedCell, now: Date) {
  const window = transitWindow(item.planet, now);
  const withTime = item.planet.windowYears <= 1;
  return {
    label: window.label,
    rows: signTransits(item.planet.key, item.sign.key, window.from, window.to).map((transit) => ({
      key: transit.start.toISOString(),
      start: withTime ? formatTransitMoment(transit.start) : formatTransitDate(transit.start),
      end: withTime ? formatTransitMoment(transit.end) : formatTransitDate(transit.end),
      duration: formatDuration(transit.start, transit.end),
      clampedStart: transit.clampedStart,
      clampedEnd: transit.clampedEnd,
    })),
  };
}

export default async function GridCellPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = cellBySlug(slug);
  if (!item) notFound();

  const { cell, planet, sign } = item;
  const table = transitRows(item, new Date());
  const neighbours = rowNeighbours(item);
  // Калькулятор обязан знать ВСЮ строку, а не только выложенные ячейки: если
  // расчёт покажет знак, страницы которого ещё нет, честнее сказать «готовится»,
  // чем промолчать и оставить человека без ответа.
  const finderTargets: FinderTarget[] = SIGN_AXES.map((axis) => ({
    signKey: axis.key,
    name: axis.name,
    prepositional: `${axis.preposition} ${axis.prepositional}`,
    path: cellByKeys(planet.key, axis.key)?.path ?? null,
  }));

  const pageUrl = canonicalUrl(item.path);
  const orgUrl = canonicalUrl("/");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: item.metaTitle,
        description: item.metaDescription,
        about: { "@type": "Thing", name: item.heading },
        articleSection: "Астрология",
        url: pageUrl,
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        inLanguage: "ru-RU",
        isAccessibleForFree: true,
        datePublished: GRID_REVIEWED_AT,
        dateModified: GRID_REVIEWED_AT,
        author: { "@type": "Organization", name: "ETerapy", url: orgUrl },
        publisher: { "@type": "Organization", name: "ETerapy", url: orgUrl },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Главная", item: orgUrl },
          { "@type": "ListItem", position: 2, name: "Планеты в знаках", item: canonicalUrl(GRID_HUB_PATH) },
          { "@type": "ListItem", position: 3, name: item.heading, item: pageUrl },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: cell.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };

  return (
    <main className="soft-clarity-page soft-public-page" data-testid={`astro-cell-${item.slug}`}>
      <JsonLdGraph data={jsonLd} />

      <article className="soft-shell-narrow py-12 md:py-16">
        <div className="flex items-center gap-1.5">
          <Link
            href={GRID_HUB_PATH}
            aria-label="Ко всем планетам в знаках"
            className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)]"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--soft-ink-faint)]">Планеты в знаках</span>
        </div>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl italic leading-snug text-[var(--soft-bordeaux)] md:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>
            {textGlyph(planet.glyph)} {item.heading} {textGlyph(sign.glyph)}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="soft-chip">{sign.element} · {sign.modality}</span>
            <span className="text-xs text-[var(--soft-ink-faint)]">
              проверено редакцией {formatTransitDate(new Date(GRID_REVIEWED_AT))}
            </span>
          </div>
        </header>

        {/* Прямой ответ. Первые 40–60 слов страницы — именно он. */}
        <p className="mt-8 max-w-3xl text-xl leading-relaxed text-[var(--soft-ink)]" style={{ fontFamily: "var(--font-heading)" }}>
          {cell.answer}
        </p>

        <SignFinder
          planetKey={planet.key}
          planetName={planet.name}
          possessive={planetPossessive(planet)}
          changedVerb={planetPast(planet, "сменил")}
          currentSignKey={sign.key}
          targets={finderTargets}
        />

        <section className="mt-12 max-w-3xl" aria-labelledby="transit-table-title">
          {/* Заголовок собирается без глагола: «была / был / было» зависит от рода
              светила, и шаблон с одной формой соврал бы на девяти строках сетки. */}
          <h2 id="transit-table-title" className="soft-h3">
            {item.heading}: точные периоды, {table.label}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Интервалы посчитаны по эфемеридам, а не переписаны из справочника. Темп: {planet.pace}.
            Время московское; возврат в знак после ретроградной петли показан отдельной строкой.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--soft-paper-edge)] text-left text-xs uppercase tracking-[0.08em] text-[var(--soft-ink-faint)]">
                  <th scope="col" className="py-2 pr-4 font-medium">Вход</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Выход</th>
                  <th scope="col" className="py-2 font-medium">Сколько</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.key} className="border-b border-[var(--soft-paper-edge)] align-top">
                    <td className="py-2.5 pr-4 text-[var(--soft-ink)]">
                      {row.clampedStart ? `до ${row.start}` : row.start}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--soft-ink)]">
                      {row.clampedEnd ? `после ${row.end}` : row.end}
                    </td>
                    <td className="py-2.5 text-[var(--soft-ink-soft)]">{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.rows.some((row) => row.clampedStart || row.clampedEnd) && (
            <p className="mt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
              «До» и «после» означают, что вход или выход лежит за границей окна таблицы, а не
              совпадает с его краем.
            </p>
          )}
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="cell-meaning-title">
          <h2 id="cell-meaning-title" className="soft-h3">
            Что значит {item.heading}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            {planet.name} в карте — {planet.domain}. Вопрос, на который она отвечает: «{planet.question}»
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            {sign.name} ({sign.element}, {sign.modality} знак) {sign.manner}.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{cell.tension}</p>
        </section>

        <section className="mt-10 grid max-w-3xl gap-8 md:grid-cols-2">
          <div>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">что это даёт</p>
            <ul className="mt-5 space-y-3">
              {cell.plus.map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--soft-sage)]" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">чем оборачивается</p>
            <ul className="mt-5 space-y-3">
              {cell.minus.map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  <TriangleAlert className="mt-1 size-4 shrink-0 text-[var(--soft-terracotta)]" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="cell-step-title">
          <h2 id="cell-step-title" className="soft-h3">С чего начать, если это про вас</h2>
          <p className="mt-4 text-lg italic leading-snug text-[var(--soft-bordeaux)]" style={{ fontFamily: "var(--font-heading)" }}>
            {cell.firstStep}
          </p>
          <p className="mt-5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Чего этот разбор не делает: {planet.misreading}. Положение в знаке — одна деталь карты, а не
            описание человека целиком и тем более не прогноз событий.
          </p>
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="cell-faq-title">
          <div className="flex items-center gap-3">
            <CircleHelp className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 id="cell-faq-title" className="soft-h3">Частые вопросы</h2>
          </div>
          <div className="mt-6 divide-y divide-[var(--soft-paper-edge)] border-y border-[var(--soft-paper-edge)]">
            {cell.faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 text-base font-semibold text-[var(--soft-ink)] marker:hidden">
                  {faq.question}
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="cell-next-title">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 id="cell-next-title" className="soft-h3">Вся карта, а не одна позиция</h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            {planet.name} в знаке — один из десяти элементов. Колесо с планетами и домами по дате,
            времени и месту рождения строится бесплатно на странице услуги.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href={mainUrl("/products/natal-chart")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4" data-testid="astro-cell-product-link">
              Рассчитать натальную карту
            </Link>
            <Link href={GRID_HUB_PATH} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4">
              Все планеты в знаках
            </Link>
            <Link href={mainUrl("/editorial-policy")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4">
              Редакционная политика
            </Link>
          </div>
        </section>

        {neighbours.length > 0 && (
          <section className="mt-12 max-w-3xl">
            <p className="soft-eyebrow mb-5">соседние знаки</p>
            <div className="grid gap-4 md:grid-cols-2">
              {neighbours.map((neighbour) => (
                <Link key={neighbour.slug} href={neighbour.path} className="soft-card p-5">
                  <span className="soft-chip soft-chip-warm">{neighbour.sign.element}</span>
                  <p className="mt-4 text-base font-semibold text-[var(--soft-ink)]">{neighbour.heading}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--soft-terracotta-dark)]">
                    читать разбор
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
