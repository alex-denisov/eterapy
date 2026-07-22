import Link from "next/link";
import { BookOpenCheck, Bot, CalendarClock, CircleAlert, FileSearch, Mail } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/editorial-policy");

const REVIEWED_AT = "22 июля 2026 года";

const PRINCIPLES = [
  {
    icon: FileSearch,
    title: "Факты отдельно от версий",
    text: "Мы отмечаем, где описываем проверяемую функцию платформы, а где предлагаем возможный взгляд на жизненную ситуацию.",
  },
  {
    icon: CircleAlert,
    title: "Границы видны сразу",
    text: "Материалы не содержат диагнозов, назначений, гарантий результата и не заменяют медицинскую, психологическую, юридическую или экстренную помощь.",
  },
  {
    icon: CalendarClock,
    title: "Есть дата пересмотра",
    text: "При существенном изменении продукта, цены, правил или источника мы обновляем страницу и дату редакционной проверки.",
  },
];

export default function EditorialPolicyPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="editorial-policy-page">
      <PublicJsonLd route="/editorial-policy" />
      <article className="soft-shell mx-auto max-w-4xl py-12 md:py-20">
        <header className="max-w-3xl">
          <p className="soft-eyebrow">доверие к материалам</p>
          <h1 className="soft-display mt-4">Редакционная политика <span className="soft-italic">ETerapy</span></h1>
          <p className="soft-lede mt-6">
            Публичные материалы подписаны организацией ETerapy. Это осознанная модель авторства:
            ответственность несёт редакция продукта, а не выдуманная именная персона.
          </p>
          <p className="mt-4 text-xs text-[var(--soft-ink-faint)]">Последний редакционный пересмотр: {REVIEWED_AT}</p>
        </header>

        <section className="mt-12 grid gap-4 md:grid-cols-3" aria-label="Редакционные принципы">
          {PRINCIPLES.map((principle) => {
            const Icon = principle.icon;
            return (
              <div key={principle.title} className="soft-card p-6">
                <Icon className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                <h2 className="soft-h3 mt-4">{principle.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{principle.text}</p>
              </div>
            );
          })}
        </section>

        <div className="mt-12 space-y-10">
          <section className="border-t border-[var(--soft-paper-edge)] pt-8">
            <div className="flex items-center gap-3">
              <BookOpenCheck className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <h2 className="soft-h2">Как готовится материал</h2>
            </div>
            <ol className="mt-6 grid gap-4 text-sm leading-relaxed text-[var(--soft-ink-soft)] md:grid-cols-2">
              {[
                "Определяем конкретный вопрос читателя и полезный результат страницы.",
                "Сверяем продуктовые факты с действующими страницами, правилами и интерфейсом ETerapy.",
                "Добавляем прямой ответ, альтернативные объяснения, проверяемый первый шаг и границы применения.",
                "Проверяем метаданные, структуру, ссылки, читаемость на мобильном экране и машинную разметку.",
              ].map((item, index) => (
                <li key={item} className="soft-card flex gap-4 p-5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-xs font-semibold text-[var(--soft-bordeaux)]">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="border-t border-[var(--soft-paper-edge)] pt-8">
            <div className="flex items-center gap-3">
              <Bot className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <h2 className="soft-h2">Как используется ИИ</h2>
            </div>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Автоматизированные инструменты помогают собирать структуру, находить повторы, адаптировать текст под разные экраны
              и формировать первичный ответ в диалоге. ИИ не получает право называться человеком, приписывать себе образование
              или выдавать вероятностный вывод за профессиональный диагноз. Правила, источники и продуктовые обещания задаёт ETerapy.
            </p>
          </section>

          <section className="border-t border-[var(--soft-paper-edge)] pt-8">
            <h2 className="soft-h2">Источники и ссылки</h2>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Описание функций и цен опирается на действующие страницы ETerapy. Для границ самопомощи мы используем материалы
              Всемирной организации здравоохранения, а экстренный маршрут в России сверяем с официальной информацией о системе 112.
            </p>
            <ul className="mt-5 space-y-3 text-sm font-medium text-[var(--soft-bordeaux)]">
              <li><a href="https://www.who.int/ru/news-room/fact-sheets/detail/self-care-health-interventions" rel="noreferrer" className="underline underline-offset-4">ВОЗ: вмешательства для самопомощи</a></li>
              <li><a href="https://www.who.int/ru/news-room/fact-sheets/detail/mental-health-strengthening-our-response" rel="noreferrer" className="underline underline-offset-4">ВОЗ: укрепление психического здоровья</a></li>
              <li><a href="https://76.mchs.gov.ru/deyatelnost/poleznaya-informaciya/rekomendacii-naseleniyu/sistema-112" rel="noreferrer" className="underline underline-offset-4">МЧС России: система 112</a></li>
              <li><Link href="/legal/ethics" className="underline underline-offset-4">Этический кодекс ETerapy</Link></li>
              <li><Link href="/legal/privacy" className="underline underline-offset-4">Политика конфиденциальности</Link></li>
            </ul>
          </section>

          <section className="soft-card bg-[var(--soft-paper-deep)] p-6 md:p-8">
            <div className="flex items-center gap-3">
              <Mail className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <h2 className="soft-h2">Исправления и обратная связь</h2>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Если вы нашли фактическую ошибку, устаревшую цену, неработающую ссылку или опасную формулировку,
              напишите на <a href="mailto:support@eterapy.com" className="font-semibold text-[var(--soft-bordeaux)] underline underline-offset-4">support@eterapy.com</a>.
              Существенные исправления проверяются редакцией и отражаются в дате пересмотра.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
