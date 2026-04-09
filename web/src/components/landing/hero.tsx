import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 py-24 md:py-36">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,168,76,0.08),transparent_60%)]" />

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
          ✦ Безопасно · Прозрачно · Онлайн
        </div>

        <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl">
          Эзотерика, которой
          <br />
          <span className="text-primary">можно доверять</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
          Найди проверенного таролога, астролога или нумеролога.
          Фиксированная цена за сессию. Бесплатные направления
          самопознания.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/practitioners" className={cn(buttonVariants({ size: "lg" }), "min-w-[200px] text-base")}>
            Найти практика
          </Link>
          <Link
            href="/modalities"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-w-[200px] border-primary/30 text-base text-primary hover:bg-primary/10")}
          >
            Направления →
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground/60">
          3 бесплатных расклада в месяц · Без привязки карты
        </p>
      </div>
    </section>
  );
}
