import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="relative overflow-hidden px-4 py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(201,168,76,0.06),transparent_60%)]" />

      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-bold md:text-4xl">
          Начни путь к{" "}
          <span className="text-primary">осознанному выбору</span>
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Бесплатный AI check-in за 2 минуты. Без регистрации. Без привязки
          карты.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" className="min-w-[220px] text-base">
            Попробовать AI бесплатно
          </Button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/50">
          Найди своего практика. Без риска. Без сомнений.
        </p>
      </div>
    </section>
  );
}
