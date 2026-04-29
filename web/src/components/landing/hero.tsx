import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HaloVisual, ScenarioCard } from "@/components/v5/premium";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const trustChips = [
  "Первичный разбор бесплатно",
  "Без запугивания",
  "Можно без регистрации",
  "Сохранение в Мою карту",
];

const scenarios = [
  {
    label: "Диалог ясности",
    title: "Начните с вопроса",
    text: "Короткий бережный диалог помогает отделить факты, чувства и предположения.",
    tone: "gold" as const,
  },
  {
    label: "Глубина",
    title: "Углубите ответ",
    text: "Ракурсы, отчет, переписка, совместимость или маршрут «7 дней к ясности».",
    tone: "lavender" as const,
  },
  {
    label: "Следующий шаг",
    title: "Выберите опору",
    text: "Если нужен живой человек, специалист появляется после контекста, цены и формата.",
    tone: "gold" as const,
  },
];

export function HeroSection() {
  return (
    <section data-testid="v5-home-hero" className="premium-page relative overflow-hidden px-4 pb-9 pt-6 md:pb-16 md:pt-14">
      <div className="mx-auto max-w-6xl">
        <div className="premium-shell halo-waterline relative overflow-hidden px-4 py-6 text-center sm:px-5 sm:py-8 md:px-10 md:py-10">
          <div className="mx-auto max-w-3xl">
            <div className="premium-eyebrow">Ясность · Диалог · Понимание</div>
            <h1 className="premium-title mt-4 text-4xl md:mt-5 md:text-5xl lg:text-6xl">
              Разберитесь в важном <span className="text-brand-soft-gold">жизненном вопросе</span>
            </h1>
            <p className="premium-lead mx-auto mt-4 max-w-2xl text-base leading-7 md:mt-5 md:text-[1.28rem] md:leading-[1.65]">
              Начните короткий диалог, получите первичный разбор ситуации и выберите,
              как углубиться: через ракурсы, переписку, совместимость, маршрут или специалиста.
            </p>
          </div>

          <HaloVisual className="my-4 max-w-[132px] sm:max-w-[220px] md:my-6 md:max-w-[240px]" />

          <form
            action="/all-modalities/checkin"
            className="relative mx-auto grid max-w-3xl gap-3 rounded-[calc(var(--radius-card)+0.25rem)] border border-brand-warm-gold/25 bg-white/[0.055] p-3 text-left shadow-[0_30px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl md:grid-cols-[1fr_auto] md:items-center md:p-4"
            data-testid="v5-question-entry"
          >
            <label htmlFor="home-question" className="sr-only">
              Что сейчас хочется понять?
            </label>
            <textarea
              id="home-question"
              name="question"
              rows={1}
              minLength={3}
              placeholder="Опишите ситуацию своими словами..."
              className="premium-input min-h-14 resize-none border-0 bg-transparent px-4 py-3 font-heading text-lg leading-relaxed text-foreground shadow-none placeholder:text-muted-foreground md:min-h-16 md:text-xl"
              data-testid="home-question-input"
            />
            <button
              type="submit"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base md:self-stretch")}
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="home-dialogue-cta"
            >
              Начать диалог
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {trustChips.map((chip, index) => (
              <span key={chip} className={cn("premium-chip", index % 2 === 0 ? "premium-chip-gold" : "premium-chip-lavender")}>
                {chip}
              </span>
            ))}
          </div>

          <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            В кризисных, медицинских, юридических и финансовых вопросах сервис покажет безопасное направление вместо платного предложения.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.label} {...scenario} />
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href="/products"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}
            data-analytics-event="product_catalog_clicked"
            data-analytics-target="/products"
          >
            Посмотреть все сценарии
          </Link>
        </div>
      </div>
    </section>
  );
}
