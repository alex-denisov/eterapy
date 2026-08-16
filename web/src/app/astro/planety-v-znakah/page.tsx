import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { canonicalUrl } from "@/lib/seo";
import { mainUrl } from "@/lib/subdomain";
import { JsonLdGraph } from "@/components/seo/json-ld-graph";
import { GRID_HUB_PATH, SIGN_AXES, gridRows, resolvedCells, textGlyph } from "@/lib/astro/cells";

/**
 * B711 · Хаб расчётной сетки «планета × знак».
 *
 * ⚠ ХАБ НУЖЕН НЕ ДЛЯ КРАСОТЫ. Сто двадцать ячеек без общей точки входа — это
 * сто двадцать сирот: на них нет ни одной внутренней ссылки, и обход у них
 * идёт только из карты сайта. Хаб держит перелинковку строкой (планета) и
 * столбцом (знак) и сам стоит в `publicSeoRoutes`.
 *
 * ⚠ ПОКАЗЫВАЕМ ТОЛЬКО ВЫЛОЖЕННОЕ. Волны идут по строкам; ячейки, которых ещё
 * нет, не превращаются в мёртвые ссылки и не заявляются как «скоро».
 */

export const metadata = createPublicPageMetadata(GRID_HUB_PATH);

export default function GridHubPage() {
  const rows = gridRows();
  const total = resolvedCells().length;
  const pageUrl = canonicalUrl(GRID_HUB_PATH);
  const orgUrl = canonicalUrl("/");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Планеты в знаках зодиака",
        description:
          "Разборы положений планет по знакам с посчитанными периодами и расчётом по дате рождения.",
        url: pageUrl,
        inLanguage: "ru-RU",
        isAccessibleForFree: true,
        publisher: { "@type": "Organization", name: "ETerapy", url: orgUrl },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: total,
          itemListElement: resolvedCells().map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.heading,
            url: canonicalUrl(item.path),
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Главная", item: orgUrl },
          { "@type": "ListItem", position: 2, name: "Планеты в знаках", item: pageUrl },
        ],
      },
    ],
  };

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="astro-grid-hub">
      <JsonLdGraph data={jsonLd} />

      <div className="soft-shell-narrow py-12 md:py-16">
        <header className="max-w-3xl">
          <h1 className="text-3xl italic leading-snug text-[var(--soft-bordeaux)] md:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>
            Планеты в знаках зодиака
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[var(--soft-ink)]">
            Положение планеты в знаке отвечает на один вопрос: каким способом человек делает то, за
            что эта планета отвечает. На каждой странице — разбор сочетания, посчитанные по
            эфемеридам периоды стояния и расчёт по вашей дате рождения.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Сейчас в сетке {total} разборов. Она достраивается по одной планете за раз, а не
            выкладывается разом.
          </p>
        </header>

        {rows.map((row) => (
          <section key={row.planet.key} className="mt-12" aria-labelledby={`row-${row.planet.key}`}>
            <h2 id={`row-${row.planet.key}`} className="soft-h3">
              {textGlyph(row.planet.glyph)} {row.planet.name} в знаках
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {row.planet.name} в карте — {row.planet.domain}. Темп: {row.planet.pace}.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {row.cells.map((cell) => (
                <li key={cell.slug}>
                  <Link href={cell.path} className="soft-card flex items-center justify-between gap-3 p-4">
                    <span className="text-base text-[var(--soft-ink)]">
                      {textGlyph(cell.sign.glyph)} {cell.heading}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-14 max-w-3xl" aria-labelledby="hub-signs-title">
          <h2 id="hub-signs-title" className="soft-h3">Двенадцать знаков: чем они отличаются</h2>
          <dl className="mt-6 divide-y divide-[var(--soft-paper-edge)] border-y border-[var(--soft-paper-edge)]">
            {SIGN_AXES.map((sign) => (
              <div key={sign.key} className="py-4">
                <dt className="font-semibold text-[var(--soft-ink)]">
                  {textGlyph(sign.glyph)} {sign.name} — {sign.element}, {sign.modality}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{sign.manner}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="hub-next-title">
          <h2 id="hub-next-title" className="soft-h3">Одна позиция или вся карта</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Разбор одной позиции не заменяет карту целиком: планеты связаны между собой, и одна и та
            же Луна в Скорпионе выглядит по-разному рядом с Сатурном и рядом с Юпитером. Колесо с
            планетами и домами строится бесплатно по дате, времени и месту рождения.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href={mainUrl("/products/natal-chart")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4" data-testid="astro-hub-product-link">
              Рассчитать натальную карту
            </Link>
            <Link href={mainUrl("/library?section=symbolic")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4">
              Библиотека разборов
            </Link>
            <Link href={mainUrl("/editorial-policy")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4">
              Редакционная политика
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
