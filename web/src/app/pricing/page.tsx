import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { HaloVisual, PremiumCard, PremiumHero, PremiumPage, PremiumSection } from "@/components/v5/premium";
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
    includes: ["ссылка-приглашение", "согласие партнера", "результат после завершения обеих сторон"],
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
    points: ["AI-саммари", "клиентский контекст по согласию", "черновики последующих сообщений", "аналитика"],
  },
];

const marginRules = [
  "бесплатный продукт ведет к платному открытию, но не давит на кризисные запросы",
  "реферальные бонусы начисляются внутренними кредитами и не выводятся деньгами",
  "бонусами нельзя оплатить 100% живой консультации",
  "разбор переписки и совместимость являются приоритетными paid products",
  "комиссия специалиста зависит от атрибуции источника",
];

export default function PricingPage() {
  return (
    <PremiumPage data-testid="pricing-page">
      <PublicJsonLd route="/pricing" />

      <PremiumHero
        eyebrow="Цены ETerapy"
        title={<>Бесплатный старт, платная глубина, <span className="text-brand-soft-gold">прозрачная подписка</span></>}
        lead="ETerapy монетизирует не каталог как первый шаг, а осознанное углубление после первичного ответа: отчеты, маршруты, совместимость, подписки и живых специалистов."
        visual={
          <PremiumCard tone="gold" className="p-6">
            <HaloVisual className="max-w-[220px]" />
            <h2 className="mt-4 font-heading text-2xl font-medium">Живые консультации</h2>
            <p className="mt-2 font-heading text-4xl font-medium text-primary">1500-12000 ₽</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Цена сессии видна до бронирования. Комиссия платформы зависит от источника клиента:
              20-25% для ETerapy-потока, 8-12% для ссылки специалиста, 10-15% для пилотных условий.
            </p>
            <Disclaimer className="mt-4">
              Специалист не является первым экраном продукта: рекомендация появляется после контекста.
            </Disclaimer>
          </PremiumCard>
        }
      >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="pricing-dialogue-cta"
            >
              Начать бесплатно
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}
            >
              Как это работает
            </Link>
          </div>
      </PremiumHero>

      <PremiumSection>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="premium-title text-3xl md:text-5xl">Разовые продукты</h2>
            <p className="mt-2 text-muted-foreground">Покупка открывается entitlement-ом, не UI-состоянием.</p>
          </div>
          <p className="text-sm text-muted-foreground">Цены из v5 финансовой модели, финальные значения настраиваются в админке.</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paidProducts.map((product) => (
            <PremiumCard key={product.name} tone={product.name === "Разбор переписки" || product.name === "Совместимость" ? "lavender" : "gold"}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading text-2xl font-medium">{product.name}</h3>
                <span className="premium-chip premium-chip-gold shrink-0">
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
            </PremiumCard>
          ))}
        </div>
      </PremiumSection>

      <PremiumSection>
        <h2 className="premium-title text-3xl md:text-5xl">Подписки и Pro</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {subscriptions.map((plan) => (
            <PremiumCard key={plan.name} tone={plan.name === "Premium" || plan.name === "Practitioner Pro" ? "lavender" : "gold"}>
              <p className="text-sm text-muted-foreground">{plan.role}</p>
              <h3 className="mt-1 font-heading text-2xl font-medium">{plan.name}</h3>
              <p className="mt-3 font-heading text-3xl font-medium text-primary">{plan.price}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </PremiumCard>
          ))}
        </div>
      </PremiumSection>

      <PremiumSection className="pt-2">
      <PremiumCard tone="lavender" className="p-6">
        <h2 className="font-heading text-3xl font-medium">Правила защиты маржи</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {marginRules.map((rule) => (
            <div key={rule} className="premium-chip w-full justify-start whitespace-normal rounded-[var(--radius-card)] p-4 text-sm leading-relaxed">
              {rule}
            </div>
          ))}
        </div>
      </PremiumCard>
      </PremiumSection>
    </PremiumPage>
  );
}
