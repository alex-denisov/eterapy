import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="soft-shell py-12 text-center md:py-20">
      <div className="inline-flex rotate-[-1.5deg] rounded-md border border-[#eed9a1] bg-[#fff6d6] px-3 py-1 font-heading text-xl italic text-[#6b4a1e] shadow-[0_2px_0_rgba(0,0,0,0.04)]">
        первый разбор бесплатно
      </div>
      <h2 className="soft-display mx-auto mt-6 max-w-3xl">
        С чего <span className="soft-italic">начнём?</span>
      </h2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/checkin"
          className="soft-button soft-button-primary soft-button-lg"
          data-analytics-event="dialogue_cta_clicked"
          data-analytics-target="/checkin"
        >
          Начать разбор
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href="/library" className="soft-button soft-button-ghost min-w-56">
          Сначала почитать
        </Link>
      </div>
    </section>
  );
}
