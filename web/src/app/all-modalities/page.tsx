import Link from "next/link";
import { ArrowRight, Compass, FileText, MessageSquareText, Route, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { buttonVariants } from "@/lib/button-variants";
import { v5Products } from "@/lib/v5-products";
import { cn } from "@/lib/utils";

const entryPoints = [
  {
    icon: MessageSquareText,
    title: "Первичный ответ",
    description: "Короткий диалог уточняет контекст и дает понятную отправную точку без регистрации.",
    href: "/products/primary-answer",
  },
  {
    icon: FileText,
    title: "Глубокие продукты",
    description: "Отчет, 4 ракурса, разбор переписки и совместимость открываются после превью и оплаты.",
    href: "/products",
  },
  {
    icon: Route,
    title: "Маршрут и удержание",
    description: "7 дней к ясности, Моя карта и ежедневная карточка помогают вернуться к выводам.",
    href: "/products/seven-days",
  },
];

const legacyTools = [
  {
    href: "/all-modalities/tarot",
    title: "Таро",
    description: "Сохранено как SEO-страница и быстрый тематический вход.",
  },
  {
    href: "/all-modalities/horoscope",
    title: "Гороскоп",
    description: "Будет переосмыслен как формат ежедневной карточки и мягких напоминаний.",
  },
  {
    href: "/all-modalities/natal",
    title: "Натальная карта",
    description: "Остается как тематический слой, но не заменяет общий question-first диалог.",
  },
];

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PublicJsonLd route="/all-modalities" />
      <section className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Сервисы ETerapy v5</p>
          <h1 className="mt-3 font-heading text-3xl font-bold leading-tight md:text-5xl">
            Не выбирайте инструмент заранее. Начните с вопроса.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Старые направления больше не являются главным меню продукта. v5 сначала понимает
            ситуацию, затем предлагает бесплатный первичный ответ, углубление, маршрут или
            специалиста как следующий шаг.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className={cn(buttonVariants({ size: "lg" }))}
              data-testid="modalities-question-first-cta"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
            >
              Задать вопрос
              <ArrowRight />
            </Link>
            <Link href="/products" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Все продукты
            </Link>
          </div>
        </div>

        <Card className="border-border/40 bg-card/55">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-heading text-lg font-semibold">Что изменилось</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Публичные страницы направлений сохраняются для понятных ссылок и SEO, но CTA,
                  аналитика и пользовательский путь ведут в единый диалог.
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-[var(--radius-card)] border border-border/35 bg-background/45 p-4">
              <p className="text-sm font-medium">Новый порядок</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Вопрос → уточнение → первичный ответ → продукт/подписка → специалист, если он
                действительно помогает с ситуацией.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-12">
        <h2 className="font-heading text-2xl font-semibold">Основные v5 сценарии</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {entryPoints.map((item) => (
            <Link key={item.title} href={item.href} className="group">
              <Card className="h-full border-border/40 bg-card/50 transition-colors group-hover:border-primary/30">
                <CardContent className="p-5">
                  <item.icon className="size-5 text-primary" />
                  <h3 className="mt-4 font-heading text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-[var(--radius-card)] border border-border/40 bg-card/45 p-5">
        <div className="flex items-start gap-3">
          <Compass className="mt-1 size-5 text-primary" />
          <div>
            <h2 className="font-heading text-xl font-semibold">Старые тематические страницы</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Эти страницы не удаляются резко: часть пользователей и поисковых ссылок все еще
              приходит через них. Они остаются вторичными входами до полной замены диалогом.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {legacyTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="rounded-[var(--radius-card)] border border-border/35 bg-background/45 p-4 transition-colors hover:border-primary/35"
            >
              <p className="text-sm font-medium">{tool.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{tool.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-2xl font-semibold">Связанные продукты</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {v5Products.slice(0, 4).map((product) => (
            <Link
              key={product.slug}
              href={`/products/${product.slug}`}
              className="rounded-[var(--radius-card)] border border-border/35 bg-card/45 p-4 transition-colors hover:border-primary/35"
            >
              <p className="text-sm font-medium">{product.name}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-8 text-xs leading-5 text-muted-foreground/70">
        Сервисы ETerapy носят ознакомительный характер и не заменяют медицинскую, юридическую
        или финансовую консультацию. В кризисных ситуациях продукт показывает безопасный маршрут,
        а не платный CTA.
      </p>
    </div>
  );
}
