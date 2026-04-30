import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HaloSymbol } from "@/components/brand/brand-mark";
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
    <section
      data-testid="v5-home-hero"
      className="premium-page landing-hero relative isolate overflow-hidden px-4 pb-9 pt-7 sm:pt-8 md:min-h-[calc(100vh-4rem)] md:pb-12 md:pt-8"
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand-glow/10 blur-3xl" />
        <div className="absolute left-[8%] top-[18%] h-72 w-72 rounded-full bg-brand-warm-gold/10 blur-3xl" />
        <div className="absolute right-[5%] top-[22%] h-80 w-80 rounded-full bg-brand-lavender/14 blur-3xl" />
        <div className="landing-hero-orbit absolute left-1/2 top-[8.25rem] hidden h-[32rem] w-[32rem] -translate-x-1/2 md:block" />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
        <div className="relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28 md:h-[8.5rem] md:w-[8.5rem]">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,215,154,0.24),rgba(142,137,214,0.08)_44%,transparent_70%)] blur-xl" />
          <div className="absolute inset-7 rounded-full bg-brand-midnight/70 shadow-[0_0_70px_rgba(255,215,154,0.16)]" />
          <HaloSymbol size={138} className="landing-halo-float relative scale-[0.84] sm:scale-100" />
        </div>

        <div className="premium-eyebrow mt-1">Ясность · Диалог · Понимание</div>
        <h1 className="premium-title mt-3 max-w-4xl text-[clamp(2.22rem,5.65vw,5.25rem)]">
          Разберитесь в важном <span className="text-brand-soft-gold">жизненном вопросе</span>
        </h1>
        <p className="premium-lead mx-auto mt-4 max-w-2xl text-base leading-7 md:text-[1.18rem] md:leading-[1.62]">
          Начните короткий диалог, получите первичный разбор ситуации и выберите,
          как углубиться: через ракурсы, переписку, совместимость, маршрут или специалиста.
        </p>

        <form
          action="/all-modalities/checkin"
          className="landing-question-surface relative mt-6 grid w-full max-w-3xl gap-2.5 p-2 text-left shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-2xl md:grid-cols-[1fr_auto] md:items-center"
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
            placeholder="Опишите ситуацию..."
            className="min-h-12 resize-none rounded-[1.15rem] border-0 bg-transparent px-4 py-3 font-heading text-base leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:outline-none md:min-h-[3.75rem] md:text-xl"
            data-testid="home-question-input"
          />
          <button
            type="submit"
            className={cn(buttonVariants({ size: "lg" }), "min-h-[3.25rem] rounded-[1.05rem] px-6 text-base shadow-[0_18px_48px_rgba(212,161,90,0.28)] transition-transform duration-[var(--motion-base)] ease-[var(--ease-standard)] active:scale-[0.96] md:self-stretch")}
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/all-modalities/checkin"
            data-testid="home-dialogue-cta"
          >
            Начать диалог
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </form>

        <div className="mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
          {trustChips.map((chip, index) => (
            <span key={chip} className={cn("premium-chip", index % 2 === 0 ? "premium-chip-gold" : "premium-chip-lavender")}>
              {chip}
            </span>
          ))}
        </div>

        <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          В кризисных, медицинских, юридических и финансовых вопросах сервис покажет безопасное направление вместо платного предложения.
        </p>

        <div className="mt-6 grid w-full gap-3 md:grid-cols-3">
          {scenarios.map((scenario) => (
            <article
              key={scenario.label}
              className={cn(
                "landing-scenario-card group relative min-h-40 overflow-hidden p-5 text-left transition-transform duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:-translate-y-1",
                scenario.tone === "gold" ? "landing-scenario-gold" : "landing-scenario-lavender",
              )}
            >
              <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-brand-glow/10 blur-2xl transition-opacity duration-[var(--motion-base)] group-hover:opacity-90" />
              <span className={cn("premium-chip", scenario.tone === "gold" ? "premium-chip-gold" : "premium-chip-lavender")}>
                {scenario.label}
              </span>
              <h3 className="mt-5 font-heading text-2xl font-medium leading-tight">{scenario.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{scenario.text}</p>
            </article>
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
