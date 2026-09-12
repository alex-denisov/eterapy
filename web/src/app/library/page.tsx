import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { approvedLibraryEntries, libraryTopics } from "@/data/anonymous-library";
import { LibrarySearch } from "@/components/library/library-search";
import { publishedSeoLibraryEntries } from "@/lib/seo/library-store";

export const metadata = createPublicPageMetadata("/library");

const SYMBOLIC_FAQS = [
  {
    question: "Что такое арканы Таро?",
    answer: "Арканы — карты Таро с устойчивыми образами и сюжетами. 22 Старших аркана описывают крупные символические темы, а 56 Младших — более повседневные ситуации. В ETerapy их используют как язык размышления, а не как доказательство будущего.",
  },
  {
    question: "Чем отличаются расклады Таро?",
    answer: "Расклады отличаются количеством и задачей позиций. Для выбора полезны варианты и последствия, для отношений — точки зрения и динамика, для одного следующего шага часто достаточно трёх карт. Хороший расклад соответствует вопросу, а не обещает универсальный ответ.",
  },
  {
    question: "Что показывает натальная карта?",
    answer: "Натальная карта показывает положение небесных тел на момент рождения и используется в астрологии как символическая схема тем и способов реагировать. Она не является научной диагностикой и не предсказывает обязательные события.",
  },
  {
    question: "Что такое Матрица судьбы?",
    answer: "Это современная эзотерическая система, которая преобразует дату рождения в позиции, связанные с 22 символическими энергиями. У разных школ бывают разные формулы, поэтому полезно видеть метод расчёта и не принимать трактовку за приговор.",
  },
  {
    question: "Почему символическая практика не даёт точного предсказания?",
    answer: "Карты, числа и астрологические схемы не доказывают событие и не заменяют факты. Их практическая ценность — помочь назвать вопрос, заметить внутреннее противоречие и выбрать действие, которое можно проверить в реальности.",
  },
] as const;

// INC-080: страница больше не принимает `searchParams`. Чтение адреса на
// сервере — единственное, что держало библиотеку в динамическом рендере; фильтр
// по теме переехал в клиентский `LibrarySearch` (подробности там). Робот теперь
// получает готовый HTML со ВСЕМИ карточками, а не пересобранный на каждый заход.
/**
 * B740 — КАТАЛОГ ПОКАЗЫВАЕТ И СТРАНИЦЫ АГЕНТА.
 *
 * Страница, выпущенная в базу, без строки в каталоге остаётся сиротой: её
 * видит только карта сайта, а внутренних ссылок на неё нет ни одной. Поэтому
 * список собирается из двух источников, а страница получает `revalidate`
 * вместо полной статики — иначе новая запись появлялась бы в каталоге только
 * после следующей выкатки.
 *
 * INC-080 при этом не откатывается: страница по-прежнему не читает `searchParams`
 * и не пересобирается на каждый заход — она пересобирается раз в пять минут.
 */
export const revalidate = 300;

export default async function LibraryPage() {
  // B596 (владелец 2026-07-27): переключателя «Жизненные ситуации /
  // Символические практики» больше нет. Он делил библиотеку по НАШЕЙ
  // таксономии, а человек ищет свою ситуацию, а не раздел: пришедший за
  // «изменяет ли он мне» не знает, в какой из двух половин смотреть, и
  // половина каталога оставалась для него невидимой. Теперь список один, а
  // разделение живёт там, где ему и место — в чипах тем.
  //
  // `?section=` принимается молча ради уже разосланных ссылок: раздел просто
  // больше ничего не сужает.
  const topics = libraryTopics();
  const entries = [...approvedLibraryEntries(), ...await publishedSeoLibraryEntries()];
  const symbolicFaqJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SYMBOLIC_FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  }).replace(/</g, "\\u003c");

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="anonymous-library-page">
      <PublicJsonLd route="/library" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: symbolicFaqJsonLd }} />

      {/* Hero — between layout matching v4 */}
      <section className="soft-shell" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="soft-eyebrow">библиотека жизненных вопросов</p>
            <h1 className="soft-h1 mt-2">
              Возможно, <span className="soft-italic">ваш вопрос</span> уже здесь
            </h1>
            <p className="soft-lede mt-3" style={{ maxWidth: 600 }}>
              Узнаваемые ситуации и вопросы — от отношений и работы до снов,
              Таро и совместимости. Короткий разбор и первый шаг, без
              комментариев и готовых решений за вас.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/checkin"
              className="soft-button soft-button-primary shrink-0"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/checkin"
              data-testid="library-dialogue-cta"
            >
              У меня похожий вопрос
            </Link>
          </div>
        </div>
      </section>

      <section className="soft-shell" style={{ paddingBottom: 80 }}>
        <LibrarySearch entries={entries} topics={topics} cardLabel="вопрос" />
        <section className="mx-auto mt-12 max-w-4xl" aria-labelledby="symbolic-library-faq-title">
            <p className="soft-eyebrow">для первого знакомства</p>
            <h2 id="symbolic-library-faq-title" className="soft-h2 mt-2">Как устроены символические практики</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--soft-ink-soft)]">Короткие ответы на вопросы, которые обычно появляются до первого расклада или расчёта.</p>
            <div className="mt-5 divide-y divide-[var(--soft-paper-edge)] rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-5">
              {SYMBOLIC_FAQS.map((faq) => (
                <details key={faq.question} className="py-5">
                  <summary className="cursor-pointer list-none font-semibold text-[var(--soft-ink)] marker:content-none">{faq.question}</summary>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--soft-ink-soft)]">{faq.answer}</p>
                </details>
              ))}
            </div>
        </section>
      </section>
    </main>
  );
}
