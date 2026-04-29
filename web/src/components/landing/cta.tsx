import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HaloVisual } from "@/components/v5/premium";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export function CTASection() {
  return (
    <section className="relative overflow-hidden px-4 py-16 md:py-24">
      <div className="premium-shell halo-waterline relative mx-auto max-w-4xl overflow-hidden px-5 py-10 text-center md:px-10 md:py-14">
        <HaloVisual className="mb-4 max-w-[150px]" />
        <h2 className="premium-title text-3xl md:text-5xl">
          Начните с одного <span className="text-brand-soft-gold">честного вопроса</span>
        </h2>
        <p className="premium-lead mx-auto mt-4 max-w-2xl">
          Бесплатный первичный ответ за несколько минут. Без привязки карты.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/all-modalities/checkin"
            className={cn(buttonVariants({ size: "lg" }), "min-w-[220px] text-base")}
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/all-modalities/checkin"
          >
            Начать диалог
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/50">
          Специалист появляется как следующий шаг, когда контекст уже понятен.
        </p>
      </div>
    </section>
  );
}
