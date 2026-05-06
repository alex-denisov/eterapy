import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { Disclaimer } from "@/components/ui/disclaimer";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/pricing");

const paidProducts = [
  {
    name: "Первичный разбор",
    price: "0 ₽",
    note: "первый момент ясности",
    includes: ["короткий диалог", "структурированный ответ", "сохранение после регистрации"],
  },
  {
    name: "4 ракурса ответа",
    price: "299 ₽",
    note: "быстрое углубление",
    includes: ["несколько перспектив", "короткий итог", "сохранение в карту"],
  },
  {
    name: "Глубокий отчет",
    price: "490-990 ₽",
    note: "главный платный отчет",
    includes: ["структура ситуации", "риски и возможности", "экспорт результата"],
  },
  {
    name: "Разбор переписки",
    price: "299-1490 ₽",
    note: "бережный анализ диалога",
    includes: ["вставка или загрузка", "удаление источника", "варианты ответа в Pro"],
  },
  {
    name: "Совместимость",
    price: "590-990 ₽",
    note: "парный отчет с согласием",
    includes: ["ссылка-приглашение", "согласие партнера", "результат после двух сторон"],
  },
  {
    name: "7 дней к ясности",
    price: "790-1490 ₽",
    note: "ежедневный маршрут",
    includes: ["шаг на день", "напоминания", "финальный отчет"],
  },
];

const subscriptions = [
  {
    name: "Free",
    price: "0 ₽",
    role: "мягкий старт",
    points: ["первичный ответ", "ограниченная история", "регистрация после результата"],
  },
  {
    name: "Plus",
    price: "399-599 ₽/мес",
    role: "регулярная ясность",
    points: ["кредиты", "Моя карта", "мягкие напоминания"],
  },
  {
    name: "Premium",
    price: "999-1490 ₽/мес",
    role: "глубокая работа",
    points: ["больше отчетов", "маршруты", "расширенная карта"],
  },
  {
    name: "Practitioner Pro",
    price: "990-2990 ₽/мес",
    role: "для практиков",
    points: ["AI-саммари", "контекст по согласию", "черновики follow-up", "аналитика"],
  },
];

const guarantees = [
  "Цена сессии всегда видна до оплаты — никаких сюрпризов при бронировании",
  "Платить можно картой через защищённую кассу: деньги удерживаются до завершения сессии",
  "Реферальные бонусы и кредиты платформы нельзя использовать для 100% оплаты живой консультации",
  "Углублённые отчёты открываются только после вашего явного согласия на покупку",
];

export default function PricingPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pricing-page">
      <PublicJsonLd route="/pricing" />

      <section className="soft-shell soft-public-hero">
        <div>
          <p className="soft-eyebrow">Цены ETerapy</p>
          <h1 className="soft-h1 mt-4">
            Бесплатный старт, платная глубина и прозрачная подписка
          </h1>
          <p className="soft-lede mt-5 max-w-2xl">
            ETerapy монетизирует не каталог как первый шаг, а осознанное углубление после первичного ответа:
            отчеты, маршруты, совместимость, подписки и живых специалистов.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className="soft-button soft-button-primary"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="pricing-dialogue-cta"
            >
              Начать бесплатно
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/how-it-works" className="soft-button soft-button-ghost">
              Как это работает
            </Link>
          </div>
        </div>

        <aside className="soft-card soft-plan-card">
          <div className="soft-avatar" aria-hidden="true">
            <Sparkles className="size-7" />
          </div>
          <h2 className="soft-h3 mt-5">Живые консультации</h2>
          <p className="soft-price mt-3">1500-12000 ₽</p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Цена указана на странице специалиста, её видно ещё до того, как вы нажмёте «Забронировать».
            Оплата проходит через защищённую кассу: деньги поступают специалисту только после
            завершения встречи.
          </p>
          <Disclaimer className="mt-4 border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
            Специалист появляется в рекомендации только после того, как вы изложили суть вопроса,
            а не как первый экран.
          </Disclaimer>
        </aside>
      </section>

      <section className="soft-shell soft-public-section">
        <div>
          <p className="soft-eyebrow">Разовые продукты</p>
          <h2 className="soft-h2 mt-3">Покупка только после того, как вы увидели результат</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-faint)]">
            Первичный ответ — бесплатно. Платный продукт предлагается, когда есть смысл идти глубже,
            а не с первого экрана.
          </p>
        </div>
        <div className="soft-public-grid mt-6">
          {paidProducts.map((product) => (
            <article key={product.name} className="soft-card soft-plan-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="soft-h3">{product.name}</h3>
                  <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">{product.note}</p>
                </div>
                <span className="soft-chip soft-chip-warm shrink-0">{product.price}</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-[var(--soft-ink-soft)]">
                {product.includes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <p className="soft-eyebrow">Подписки и Pro</p>
        <h2 className="soft-h2 mt-3">Регулярная работа без визуального давления</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {subscriptions.map((plan) => (
            <article key={plan.name} className="soft-card soft-plan-card">
              <p className="text-sm text-[var(--soft-ink-faint)]">{plan.role}</p>
              <h3 className="soft-h3 mt-2">{plan.name}</h3>
              <p className="mt-4 font-heading text-3xl font-medium text-[var(--soft-bordeaux)]">{plan.price}</p>
              <ul className="mt-5 space-y-2 text-sm text-[var(--soft-ink-soft)]">
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="soft-card soft-form-panel">
          <h2 className="soft-h2">Как устроена оплата</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Мы стараемся сделать так, чтобы у вас не было неприятных сюрпризов ни с ценой, ни с условиями.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {guarantees.map((item) => (
              <div key={item} className="soft-chip w-full justify-start whitespace-normal rounded-[var(--soft-radius-md)] p-4 text-sm leading-relaxed">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
