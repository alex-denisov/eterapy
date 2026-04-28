import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { Disclaimer } from "@/components/ui/disclaimer";
import { buttonVariants } from "@/lib/button-variants";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { cn } from "@/lib/utils";

export const metadata = createPublicPageMetadata("/pricing");

const paidProducts = [
  {
    name: "Первичный разбор",
    price: "0 ₽",
    note: "activation и первый value moment",
    includes: ["короткий диалог", "структурированный ответ", "сохранение после регистрации"],
  },
  {
    name: "4 ракурса ответа",
    price: "299 ₽",
    note: "быстрое платное углубление",
    includes: ["несколько перспектив", "короткий итог", "save-to-map"],
  },
  {
    name: "Глубокий отчет",
    price: "490-990 ₽",
    note: "главный отчет после первичного ответа",
    includes: ["структура ситуации", "риски и возможности", "экспорт результата"],
  },
  {
    name: "Разбор переписки",
    price: "299-1490 ₽",
    note: "Start, Deep или Pro",
    includes: ["загрузка или вставка текста", "удаление источника", "варианты ответа в Pro"],
  },
  {
    name: "Совместимость",
    price: "590-990 ₽",
    note: "парный отчет с согласием второго участника",
    includes: ["invite flow", "partner consent", "результат после завершения обеих сторон"],
  },
  {
    name: "7 дней к ясности",
    price: "790-1490 ₽",
    note: "маршрут с итоговым отчетом",
    includes: ["ежедневный шаг", "напоминания", "финальный отчет"],
  },
  {
    name: "Моя карта",
    price: "990-2990 ₽",
    note: "накопление ценности и годовой отчет",
    includes: ["личные артефакты", "экспорт", "удаление по запросу"],
  },
];

const subscriptions = [
  {
    name: "Free",
    price: "0 ₽",
    role: "activation",
    points: ["первичный ответ", "ограниченная история", "регистрация после value moment"],
  },
  {
    name: "Plus",
    price: "399-599 ₽/мес",
    role: "recurring entry",
    points: ["кредиты", "история", "карта", "мягкие напоминания"],
  },
  {
    name: "Premium",
    price: "999-1490 ₽/мес",
    role: "deep use",
    points: ["больше кредитов", "маршруты", "отчеты", "расширенная карта"],
  },
  {
    name: "Practitioner Pro",
    price: "990-2990 ₽/мес",
    role: "B2B SaaS",
    points: ["AI summary", "client brief по согласию", "follow-up drafts", "аналитика"],
  },
];

const marginRules = [
  "бесплатный продукт ведет к paid unlock, но не давит на кризисные запросы",
  "реферальные бонусы начисляются внутренними кредитами и не выводятся деньгами",
  "бонусами нельзя оплатить 100% живой консультации",
  "разбор переписки и совместимость являются приоритетными paid products",
  "комиссия специалиста зависит от source attribution",
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-14 md:py-20" data-testid="pricing-page">
      <PublicJsonLd route="/pricing" />

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div>
          <p className="text-sm font-semibold text-primary">Цены v5</p>
          <h1 className="mt-3 font-heading text-4xl font-bold leading-tight md:text-6xl">
            Бесплатный старт, платная глубина, прозрачная подписка
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            ETerapy монетизирует не каталог как первый шаг, а осознанное углубление
            после первичного ответа: отчеты, маршруты, совместимость, подписки и живых специалистов.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="pricing-dialogue-cta"
            >
              Начать бесплатно
            </Link>
            <Link
              href="/how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}
            >
              Как это работает
            </Link>
          </div>
        </div>

        <aside className="rounded-[var(--radius-card)] border border-border/40 bg-card/40 p-5">
          <h2 className="text-base font-semibold">Живые консультации</h2>
          <p className="mt-2 text-3xl font-bold text-primary">1500-12000 ₽</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Цена сессии видна до бронирования. Комиссия платформы зависит от источника клиента:
            20-25% для ETerapy-потока, 8-12% для ссылки специалиста, 10-15% для пилотных условий.
          </p>
          <Disclaimer className="mt-4">
            Специалист не является первым экраном продукта: рекомендация появляется после контекста.
          </Disclaimer>
        </aside>
      </section>

      <section className="mt-14">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="font-heading text-3xl font-semibold">Разовые продукты</h2>
            <p className="mt-2 text-muted-foreground">Покупка открывается entitlement-ом, не UI-состоянием.</p>
          </div>
          <p className="text-sm text-muted-foreground">Цены из v5 финансовой модели, финальные значения настраиваются в админке.</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paidProducts.map((product) => (
            <article key={product.name} className="rounded-[var(--radius-card)] border border-border/30 bg-card/25 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{product.name}</h3>
                <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                  {product.price}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{product.note}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {product.includes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-primary">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-heading text-3xl font-semibold">Подписки и Pro</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {subscriptions.map((plan) => (
            <article key={plan.name} className="rounded-[var(--radius-card)] border border-border/30 bg-card/25 p-5">
              <p className="text-sm text-muted-foreground">{plan.role}</p>
              <h3 className="mt-1 text-xl font-semibold">{plan.name}</h3>
              <p className="mt-3 text-2xl font-bold text-primary">{plan.price}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-[var(--radius-card)] border border-primary/20 bg-primary/5 p-6">
        <h2 className="font-heading text-2xl font-semibold">Правила защиты маржи</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {marginRules.map((rule) => (
            <div key={rule} className="rounded-[var(--radius-control)] border border-border/30 bg-background/50 p-4 text-sm leading-relaxed text-muted-foreground">
              {rule}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
