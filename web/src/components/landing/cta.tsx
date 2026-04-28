import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export function CTASection() {
  return (
    <section className="relative overflow-hidden px-4 py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(201,168,76,0.06),transparent_60%)]" />

      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-bold md:text-4xl">
          Начните с одного <span className="text-primary">честного вопроса</span>
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Бесплатный первичный ответ за несколько минут. Без привязки карты.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/all-modalities/checkin"
            className={cn(buttonVariants({ size: "lg" }), "min-w-[220px] text-base")}
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/all-modalities/checkin"
          >
            Задать вопрос
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/50">
          Специалист появляется как следующий шаг, когда контекст уже понятен.
        </p>
      </div>
    </section>
  );
}
