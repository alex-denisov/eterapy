import Link from "next/link";
import { ArrowRight, Compass, FileText, MessageSquareText, Route, ShieldCheck } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { v5Products } from "@/lib/v5-products";

const entryPoints = [
  {
    icon: MessageSquareText,
    title: "Первичный ответ",
    description: "Короткий диалог уточняет контекст и дает понятную отправную точку без регистрации.",
    href: "/all-modalities/checkin",
  },
  {
    icon: FileText,
    title: "Глубокие продукты",
    description: "Отчет, 4 ракурса, разбор переписки и совместимость открываются после превью и оплаты.",
    href: "/products",
  },
  {
    icon: Route,
    title: "Маршрут и удержание",
    description: "7 дней к ясности, Моя карта и ежедневная карточка помогают вернуться к выводам.",
    href: "/products/seven-days",
  },
];

const legacyTools = [
  {
    href: "/all-modalities/checkin?source=legacy-tarot-card",
    title: "Таро",
    description: "Тематический вход теперь ведет в единый диалог, без отдельной платной развилки.",
  },
  {
    href: "/all-modalities/checkin?source=legacy-horoscope-card",
    title: "Гороскоп",
    description: "Переосмысляется как ежедневная карточка и мягкое напоминание внутри v5.",
  },
  {
    href: "/all-modalities/checkin?source=legacy-natal-card",
    title: "Натальная карта",
    description: "Остается темой для разговора, но не отдельным платным инструментом.",
  },
];

export default function ToolsPage() {
  return (
    <main className="soft-clarity-page soft-public-page">
      <PublicJsonLd route="/all-modalities" />

      <section className="soft-shell soft-public-hero">
        <div>
          <p className="soft-eyebrow">Сервисы ETerapy v5</p>
          <h1 className="soft-h1 mt-4">Не выбирайте инструмент заранее. Начните с вопроса.</h1>
          <p className="soft-lede mt-5 max-w-2xl">
            Старые направления больше не являются главным меню продукта. v5 сначала понимает ситуацию,
            затем предлагает бесплатный первичный ответ, углубление, маршрут или специалиста как следующий шаг.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className="soft-button soft-button-primary"
              data-testid="modalities-question-first-cta"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
            >
              Задать вопрос
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/products" className="soft-button soft-button-ghost">
              Все продукты
            </Link>
          </div>
        </div>

        <aside className="soft-card soft-form-panel">
          <ShieldCheck className="size-6 text-[var(--soft-terracotta)]" aria-hidden="true" />
          <h2 className="soft-h3 mt-4">Что изменилось</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Публичные страницы направлений сохраняются для понятных ссылок и SEO, но CTA,
            аналитика и пользовательский путь ведут в единый диалог.
          </p>
          <div className="soft-card-flat mt-5 p-4">
            <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">Новый порядок</p>
            <p className="mt-2 text-sm leading-6 text-[var(--soft-ink-soft)]">
              Вопрос → уточнение → первичный ответ → продукт/подписка → специалист, если он действительно помогает.
            </p>
          </div>
        </aside>
      </section>

      <section className="soft-shell soft-public-section">
        <p className="soft-eyebrow">Основные v5 сценарии</p>
        <h2 className="soft-h2 mt-3">От короткого ответа до маршрута</h2>
        <div className="soft-public-grid mt-6">
          {entryPoints.map((item) => (
            <Link key={item.title} href={item.href} className="soft-card soft-product-tile block">
              <item.icon className="size-5 text-[var(--soft-terracotta)]" aria-hidden="true" />
              <h3 className="soft-h3 mt-4">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--soft-ink-soft)]">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="soft-card soft-form-panel">
          <div className="flex items-start gap-3">
            <Compass className="mt-1 size-5 shrink-0 text-[var(--soft-terracotta)]" aria-hidden="true" />
            <div>
              <h2 className="soft-h3">Старые тематические страницы</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--soft-ink-soft)]">
                Эти страницы не удаляются резко: часть пользователей и поисковых ссылок все еще приходит через них.
                Они остаются вторичными входами до полной замены диалогом.
              </p>
            </div>
          </div>
          <div className="soft-public-grid mt-5">
            {legacyTools.map((tool) => (
              <Link key={tool.href} href={tool.href} className="soft-card soft-plan-card block">
                <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">{tool.title}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--soft-ink-soft)]">{tool.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <p className="soft-eyebrow">Связанные продукты</p>
        <h2 className="soft-h2 mt-3">Глубина после первичного ответа</h2>
        <div className="soft-public-grid-2 mt-6">
          {v5Products.slice(0, 4).map((product) => (
            <Link key={product.slug} href={`/products/${product.slug}`} className="soft-card soft-plan-card block">
              <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">{product.name}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--soft-ink-soft)]">{product.summary}</p>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-xs leading-5 text-[var(--soft-ink-faint)]">
          Сервисы ETerapy носят ознакомительный характер и не заменяют медицинскую, юридическую
          или финансовую консультацию. В кризисных ситуациях продукт показывает безопасный маршрут,
          а не платный CTA.
        </p>
      </section>
    </main>
  );
}
