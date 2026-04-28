import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { Disclaimer } from "@/components/ui/disclaimer";
import { buttonVariants } from "@/lib/button-variants";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { cn } from "@/lib/utils";

export const metadata = createPublicPageMetadata("/how-it-works");

const stages = [
  {
    step: "01",
    title: "Вопрос вместо каталога",
    text: "Пользователь начинает с живой формулировки ситуации. Система не просит выбирать практика до того, как понятен контекст.",
    mechanics: ["анонимная сессия", "sourceAttribution=seo", "сохранение после value moment"],
  },
  {
    step: "02",
    title: "Уточняющий диалог",
    text: "Диалог задает 2-5 коротких вопросов, распознает сложность темы и останавливает кризисные сценарии до монетизации.",
    mechanics: ["quick replies", "skip state", "refresh recovery", "safety interrupt"],
  },
  {
    step: "03",
    title: "Бесплатный первичный ответ",
    text: "Пользователь получает структурированное отражение: что происходит, какие есть перспективы и какой следующий шаг уместен.",
    mechanics: ["save/share/deepen", "registration gate после результата", "no paid CTA in crisis"],
  },
  {
    step: "04",
    title: "Платная глубина или подписка",
    text: "Если нужно больше, ETerapy предлагает deep report, перспективы, совместимость, 7-дневный маршрут или подписку.",
    mechanics: ["entitlement-based unlock", "trial/cancel lifecycle", "payment failure retry"],
  },
  {
    step: "05",
    title: "Специалист как следующий шаг",
    text: "Практик появляется не как витрина, а как рекомендация после контекста: 2-3 специалиста, rationale, формат и цена.",
    mechanics: ["recommendation rationale", "fixed packages", "booking notifications"],
  },
];

const safeguards = [
  "медицинские, юридические и финансовые темы получают безопасную направляющую копию",
  "кризисные запросы логируются и не показывают платные предложения",
  "Telegram/email/web уведомления зависят от согласий и preference center",
  "платные результаты открываются только через entitlement, а не через UI-состояние",
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-14 md:py-20" data-testid="how-it-works-page">
      <PublicJsonLd route="/how-it-works" />

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div>
          <p className="text-sm font-semibold text-primary">ETerapy v5 flow</p>
          <h1 className="mt-3 font-heading text-4xl font-bold leading-tight md:text-6xl">
            От вопроса к ясному следующему шагу
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            v5 убирает выбор из каталога как первый шаг. Сначала платформа помогает
            понять ситуацию, затем предлагает глубину продукта или специалиста, если это уместно.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="how-it-works-dialogue-cta"
            >
              Задать вопрос
            </Link>
            <Link
              href="/all-modalities"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}
            >
              Посмотреть сервисы
            </Link>
          </div>
        </div>

        <aside className="rounded-[var(--radius-card)] border border-border/40 bg-card/40 p-5">
          <h2 className="text-base font-semibold">Главное правило</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Специалист и покупка появляются после контекста. Это снижает случайные
            бронирования, лишнюю тревогу и неподходящие предложения.
          </p>
          <Disclaimer className="mt-4">
            ETerapy не заменяет врача, психолога, юриста или финансового консультанта.
          </Disclaimer>
        </aside>
      </section>

      <section className="mt-14 grid gap-4" aria-label="Путь пользователя">
        {stages.map((stage) => (
          <article key={stage.step} className="grid gap-4 rounded-[var(--radius-card)] border border-border/30 bg-card/25 p-5 md:grid-cols-[84px_minmax(0,1fr)_280px]">
            <div className="font-heading text-3xl font-bold text-primary/50">{stage.step}</div>
            <div>
              <h2 className="text-xl font-semibold">{stage.title}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{stage.text}</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {stage.mechanics.map((item) => (
                <li key={item} className="rounded-full border border-border/30 bg-background/40 px-3 py-1.5">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="mt-14 rounded-[var(--radius-card)] border border-primary/20 bg-primary/5 p-6">
        <h2 className="font-heading text-2xl font-semibold">Защитные механики</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {safeguards.map((item) => (
            <div key={item} className="rounded-[var(--radius-control)] border border-border/30 bg-background/50 p-4 text-sm leading-relaxed text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
