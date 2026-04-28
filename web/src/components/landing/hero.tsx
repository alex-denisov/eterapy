import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section data-testid="v5-home-hero" className="relative overflow-hidden px-4 pb-16 pt-16 md:pb-20 md:pt-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--dialogue-halo-shell),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div>
          <div className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
            Question-first · free answer · safe next step
          </div>

          <h1 className="font-heading text-4xl font-bold leading-tight tracking-normal md:text-6xl lg:text-7xl">
            Сначала вопрос.
            <br />
            Потом ясный <span className="text-primary">ответ</span>.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            ETerapy помогает сформулировать ситуацию, получить первичное отражение
            и только потом выбрать глубину: отчет, маршрут или специалиста.
          </p>

          <div className="mt-8 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="rounded-full border border-border/40 bg-card/30 px-3 py-1.5">Без карты на старте</span>
            <span className="rounded-full border border-border/40 bg-card/30 px-3 py-1.5">Без запугивания</span>
            <span className="rounded-full border border-border/40 bg-card/30 px-3 py-1.5">С сохранением результата</span>
          </div>
        </div>

        <form
          action="/all-modalities/checkin"
          className="rounded-[var(--radius-card)] border border-border/40 bg-card/60 p-4 shadow-[var(--shadow-halo-soft)] backdrop-blur"
          data-testid="v5-question-entry"
        >
          <label htmlFor="home-question" className="text-sm font-medium text-foreground">
            Что сейчас хочется понять?
          </label>
          <textarea
            id="home-question"
            name="question"
            rows={5}
            minLength={3}
            placeholder="Например: почему я застрял в этом выборе и какой следующий шаг будет бережным?"
            className="mt-3 min-h-36 w-full resize-none rounded-[var(--radius-control)] border border-border/40 bg-background/70 px-4 py-3 text-base leading-relaxed text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            data-testid="home-question-input"
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 flex-1 text-base")}
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="home-dialogue-cta"
            >
              Получить первый ответ
            </button>
            <Link
              href="/all-modalities"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 border-primary/30 text-base text-primary hover:bg-primary/10")}
              data-analytics-event="product_catalog_clicked"
              data-analytics-target="/all-modalities"
            >
              Все сервисы
            </Link>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            В кризисных, медицинских, юридических и финансовых вопросах сервис покажет безопасное направление вместо платного CTA.
          </p>
        </form>
      </div>

      <div className="relative mx-auto mt-12 grid max-w-6xl gap-3 sm:grid-cols-3">
        {[
          ["1", "Диалог уточняет контекст", "2-5 вопросов помогают убрать шум и не продавать лишнее."],
          ["2", "Ответ остается вашим", "Результат можно сохранить после регистрации в момент ценности."],
          ["3", "Следующий шаг по ситуации", "Углубление, 7 дней, совместимость или специалист только когда это уместно."],
        ].map(([step, title, text]) => (
          <div key={step} className="rounded-[var(--radius-card)] border border-border/30 bg-card/30 p-4">
            <div className="text-sm font-semibold text-primary">{step}</div>
            <h2 className="mt-2 text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
