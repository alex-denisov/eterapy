import Image from "next/image";
import Link from "next/link";
import { HOME_CONTENT_REVIEWED_AT, HOME_FAQS, homeAuthorityJsonLd } from "@/lib/home-authority-content";

const useCases = [
  {
    situation: "Нужно назвать главную развилку",
    example: "«Стоит ли менять работу сейчас или сначала обсудить условия?»",
    result: "Факты, предположения, критерии выбора и один следующий шаг",
  },
  {
    situation: "Нужно подготовиться к разговору",
    example: "«Как спокойно обсудить молчание после конфликта?»",
    result: "Цель разговора, границы и нейтральная формулировка",
  },
  {
    situation: "Тема повторяется и не сдвигается",
    example: "«Почему я снова оказываюсь в похожей ситуации?»",
    result: "Карта повторов и рекомендация обратиться к специалисту, если нужна глубина",
  },
] as const;

export function HomeAuthorityArticle() {
  const [articleJsonLd, faqJsonLd] = homeAuthorityJsonLd();
  const safeArticleJsonLd = JSON.stringify(articleJsonLd).replace(/</g, "\\u003c");
  const safeFaqJsonLd = JSON.stringify(faqJsonLd).replace(/</g, "\\u003c");

  return (
    <article
      className="soft-shell py-16 md:py-24"
      aria-labelledby="eterapy-guide-title"
      data-testid="home-authority-article"
      itemScope
      itemType="https://schema.org/Article"
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeArticleJsonLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeFaqJsonLd }} />

      <header className="grid gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(240px,.7fr)] md:items-end">
        <div>
          <p className="soft-eyebrow">коротко и по существу</p>
          <h2 id="eterapy-guide-title" className="soft-h1 mt-3" itemProp="headline">
            Что делает ETerapy и <span className="soft-italic">когда этого достаточно</span>
          </h2>
          <p className="soft-lede mt-5 max-w-3xl" itemProp="description">
            ETerapy помогает разобрать жизненный вопрос: уточнить контекст, отделить факты от чувств и предположений,
            увидеть развилку и выбрать безопасный следующий шаг. Это инструмент рефлексии, а не лечение, диагноз или
            замена психолога, врача, юриста либо финансового консультанта.
          </p>
        </div>
        <aside className="soft-card-flat p-5" aria-label="Краткий вывод">
          <p className="soft-eyebrow">вывод</p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Начните здесь, если вам нужно сформулировать вопрос и увидеть варианты. Выберите живого специалиста,
            если важны диагностика, профессиональная ответственность, длительная работа или кризисная поддержка.
          </p>
        </aside>
      </header>

      <section className="mt-8 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-white/55 p-5" aria-labelledby="home-summary-title">
        <h3 id="home-summary-title" className="font-semibold text-[var(--soft-bordeaux)]">Короткий ответ</h3>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          ETerapy подходит совершеннолетнему человеку, который уже замечает жизненную проблему, но ещё не сформулировал точный вопрос.
          Бесплатный первичный разбор помогает назвать факты, чувства, предположения и критерии решения. Если нужны диагностика,
          профессиональная ответственность или длительная поддержка, следующий шаг — профильный специалист, а не новый цифровой отчёт.
        </p>
      </section>

      <figure className="mt-10 overflow-hidden rounded-[var(--soft-radius-xl)] bg-[var(--soft-paper-deep)] p-3 md:p-5">
        <Image
          src="/clarity-flow.svg"
          alt="Схема пути ETerapy: вопрос, первичный разбор, выбор углубления и специалист при необходимости"
          width={1200}
          height={360}
          className="h-auto w-full"
        />
        <figcaption className="mt-3 text-center text-xs text-[var(--soft-ink-faint)]">
          Один вопрос не обязывает покупать продолжение: глубину выбирает пользователь.
        </figcaption>
      </figure>

      <section className="mt-14 grid gap-8 md:grid-cols-2" aria-labelledby="definitions-title">
        <div>
          <h3 id="definitions-title" className="soft-h2">Определения без сложных терминов</h3>
          <dl className="mt-6 space-y-5">
            <div>
              <dt className="font-semibold text-[var(--soft-bordeaux)]">Диалог ясности</dt>
              <dd className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Короткая последовательность уточняющих вопросов, которая помогает превратить спутанное описание в конкретный запрос.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--soft-bordeaux)]">Первичный разбор</dt>
              <dd className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Самостоятельный информационный результат: переформулировка вопроса, главная развилка, наблюдения и следующий шаг.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--soft-bordeaux)]">Углубление</dt>
              <dd className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Не обязательная покупка, а отдельный формат: больше точек зрения, подробный отчёт, разбор переписки, маршрут или встреча.
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <h3 className="soft-h2">Для кого этот первый шаг</h3>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Для человека, который уже видит проблему, но ещё не понимает, как её сформулировать и какая помощь уместна.
            Платформа не требует выбирать метод или специалиста до того, как станет понятна сама задача.
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            <li>Отношения: подготовиться к разговору, заметить разные объяснения поведения.</li>
            <li>Работа и выбор: назвать критерии, риски и следующий обратимый шаг.</li>
            <li>Повторяющиеся ситуации: собрать наблюдения и понять, нужна ли живая профессиональная работа.</li>
          </ul>
          <p className="mt-5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Если есть риск для жизни или безопасности, звоните 112. Официальное описание работы номера доступно на сайте
            {" "}<a className="underline underline-offset-4" href="https://76.mchs.gov.ru/deyatelnost/poleznaya-informaciya/rekomendacii-naseleniyu/sistema-112" rel="noreferrer">МЧС России</a>.
            Для обычных вопросов о платформе используйте <Link href="/help" className="underline underline-offset-4">центр помощи ETerapy</Link>.
          </p>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="examples-title">
        <h3 id="examples-title" className="soft-h2">Три практических примера</h3>
        <div className="mt-6 overflow-x-auto rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)]">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">Примеры вопросов и ожидаемых результатов первичного разбора</caption>
            <thead>
              <tr className="text-[var(--soft-bordeaux)]">
                <th className="p-4 font-semibold">Ситуация</th>
                <th className="p-4 font-semibold">Пример вопроса</th>
                <th className="p-4 font-semibold">Полезный результат</th>
              </tr>
            </thead>
            <tbody className="text-[var(--soft-ink-soft)]">
              {useCases.map((item) => (
                <tr key={item.situation} className="border-t border-[var(--soft-paper-edge)] align-top">
                  <td className="p-4 font-medium text-[var(--soft-ink)]">{item.situation}</td>
                  <td className="p-4">{item.example}</td>
                  <td className="p-4">{item.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-2" aria-labelledby="decision-title">
        <div>
          <h3 id="decision-title" className="soft-h2">Как выбрать следующий формат</h3>
          <ol className="mt-5 space-y-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            <li><strong className="text-[var(--soft-ink)]">Остановиться на первичном разборе:</strong> если вопрос стал яснее и уже есть безопасный обратимый шаг.</li>
            <li><strong className="text-[var(--soft-ink)]">Выбрать цифровое углубление:</strong> если нужен письменный документ, несколько точек зрения или работа с конкретным материалом.</li>
            <li><strong className="text-[var(--soft-ink)]">Выбрать специалиста:</strong> если важны профессиональная оценка, ответственность человека, длительная поддержка или тема не сдвигается.</li>
          </ol>
        </div>
        <div>
          <h3 className="soft-h2">Ограничения и разные точки зрения</h3>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Письменная рефлексия удобна и доступна сразу, но не видит невербальные сигналы и не несёт ответственности профильного специалиста.
            Живой разговор даёт больше контекста, но требует времени, доверия и отдельной оплаты. Символические форматы могут быть полезны как метафора,
            но не должны подаваться как факт или прогноз.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            ВОЗ рассматривает самопомощь как дополнение, а не альтернативу профессиональной помощи. См. актуальный
            {" "}<a className="underline underline-offset-4" href="https://www.who.int/ru/news-room/fact-sheets/detail/self-care-health-interventions" rel="noreferrer">обзор ВОЗ о самопомощи</a>.
            Границы цифровых и живых форматов ETerapy также закреплены в <Link href="/legal/ethics" className="underline underline-offset-4">этическом кодексе</Link>
            {" "}и <Link href="/how-it-works" className="underline underline-offset-4">описании процесса</Link>.
          </p>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="home-conclusion-title">
        <h3 id="home-conclusion-title" className="soft-h2">Вывод и следующий шаг</h3>
        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Начните с одного конкретного вопроса и используйте первичный разбор как карту, а не как окончательный ответ.
          Если после разбора понятен безопасный обратимый шаг, дополнительная покупка не нужна. Если цена ошибки высока,
          тема касается здоровья, безопасности, права или финансов либо ситуация регулярно повторяется, выберите профильного человека.
          Платные форматы и их отличия опубликованы в <Link href="/pricing/compare" className="underline underline-offset-4">сравнении тарифов</Link>.
        </p>
      </section>

      <section id="faq" className="mt-16 scroll-mt-24" aria-labelledby="home-faq-title">
        <p className="soft-eyebrow">частые вопросы</p>
        <h3 id="home-faq-title" className="soft-h1 mt-3">Ответы перед началом</h3>
        <div className="mt-8 divide-y divide-[var(--soft-paper-edge)] border-y border-[var(--soft-paper-edge)]">
          {HOME_FAQS.map((faq) => (
            <details key={faq.question} className="group py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium text-[var(--soft-ink)] focus-visible:outline-none">
                {faq.question}
                <span className="text-xl text-[var(--soft-terracotta-dark)] group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="max-w-3xl pb-2 pr-10 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-12 flex flex-col gap-5 border-t border-[var(--soft-paper-edge)] pt-8 text-sm text-[var(--soft-ink-soft)] md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <address className="not-italic" itemProp="author" itemScope itemType="https://schema.org/Organization">
            <p className="font-semibold text-[var(--soft-ink)]" itemProp="name">Автор: редакция ETerapy</p>
            <p className="mt-1 leading-relaxed">
              Компетенция редакции — продуктовые правила, клиентская безопасность, этические и юридические границы платформы.
              Это не клинический материал; медицинская рецензия не проводилась.
            </p>
          </address>
          <p className="mt-2 leading-relaxed">
            Редакционные правила опираются на продуктовую политику, этический кодекс, безопасность и юридические ограничения платформы.
            Опубликовано: <time dateTime="2026-07-15" itemProp="datePublished">15 июля 2026 года</time>.
            Последняя проверка: <time dateTime={HOME_CONTENT_REVIEWED_AT} itemProp="dateModified">15 июля 2026 года</time>.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Редакционные документы">
          <Link href="/about" className="underline underline-offset-4">О проекте</Link>
          <Link href="/legal/ethics" className="underline underline-offset-4">Этический кодекс</Link>
          <Link href="/legal/privacy" className="underline underline-offset-4">Конфиденциальность</Link>
          <Link href="/help" className="underline underline-offset-4">Помощь</Link>
        </nav>
      </footer>
    </article>
  );
}
