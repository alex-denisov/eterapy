import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/about");

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <PublicJsonLd route="/about" />
      {/* Hero */}
      <div className="mb-16 text-center">
        <span className="inline-block text-5xl mb-6">✦</span>
        <h1 className="font-heading text-4xl font-bold leading-tight">О проекте ETerapy</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Этичная платформа для работы с тарологами, астрологами и нумерологами.
          Люди, смыслы и технологии на стороне вашего внутреннего мира.
        </p>
      </div>

      <div className="space-y-14">
        {/* Проблема */}
        <section>
          <h2 className="font-heading text-2xl font-semibold mb-4">Зачем мы существуем</h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Рынок эзотерических услуг в России и СНГ не имеет ни стандартов, ни защиты покупателя.
              Люди платят в Telegram без чека, сталкиваются с запугиванием и манипуляциями,
              не могут проверить кто им пишет.
            </p>
            <p>
              ETerapy создана чтобы изменить это. Мы не пытаемся «легитимизировать» эзотерику —
              мы строим безопасную среду, где люди могут обращаться к практикам без риска.
              Честно, прозрачно, с защитой интересов обеих сторон.
            </p>
          </div>
        </section>

        {/* Принципы */}
        <section>
          <h2 className="font-heading text-2xl font-semibold mb-6">Наши принципы</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: "🛡️",
                title: "Безопасность",
                text: "Никаких угроз, порч и программирования. Практики проходят проверку и подписывают кодекс этики.",
              },
              {
                icon: "💰",
                title: "Честная цена",
                text: "Фиксированная тарифная сетка. Никаких скрытых платежей. Деньги списываются только после подтверждения сессии.",
              },
              {
                icon: "🔒",
                title: "Конфиденциальность",
                text: "Содержание сессий не хранится без вашего согласия. История чата и видео доступны только участникам.",
              },
              {
                icon: "⭐",
                title: "Качество",
                text: "Реальные отзывы от верифицированных клиентов. Рейтинг считается честно — без накрутки.",
              },
              {
                icon: "🤝",
                title: "Поддержка практиков",
                text: "Стабильный доход, своевременные выплаты, инструменты для ведения расписания и клиентской базы.",
              },
              {
                icon: "✦",
                title: "Развитие",
                text: "Направления для самопознания доступны бесплатно — 3 раза в месяц без регистрации.",
              },
            ].map(item => (
              <div key={item.title} className="rounded-xl border border-border/30 bg-card/20 p-5">
                <div className="text-2xl mb-3">{item.icon}</div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Как работает */}
        <section>
          <h2 className="font-heading text-2xl font-semibold mb-6">Как работает платформа</h2>
          <div className="space-y-3">
            {[
              { n: 1, text: "Клиент выбирает практика из каталога по специализации, рейтингу и тарифу" },
              { n: 2, text: "Бронирует слот в расписании и вносит оплату через платёжную систему" },
              { n: 3, text: "Сессия проходит в зашифрованном видеочате прямо на платформе" },
              { n: 4, text: "После сессии клиент оставляет отзыв — рейтинг практика обновляется автоматически" },
              { n: 5, text: "Практик получает выплату за вычетом комиссии платформы (15%)" },
            ].map(step => (
              <div key={step.n} className="flex gap-4 items-start">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                  {step.n}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pt-1">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Юридическая оговорка */}
        <section className="rounded-xl border border-border/30 bg-card/20 p-6">
          <h2 className="font-heading text-lg font-semibold mb-3">Правовая позиция</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ETerapy — платформа для развлекательных и рефлексивных практик.
            Услуги практиков не являются медицинской, психологической или юридической помощью.
            Любые рекомендации носят информационно-развлекательный характер.
            При психологических затруднениях обращайтесь к лицензированным специалистам.
          </p>
        </section>

        {/* CTA */}
        <div className="text-center space-y-4 pt-4">
          <p className="text-muted-foreground">Готовы начать с вопроса и понятного следующего шага?</p>
          <div className="flex gap-3 justify-center">
            <Link href="/all-modalities/checkin" className={cn(buttonVariants(), "px-6")}>
              Задать вопрос
            </Link>
            <Link href="/practitioners/apply" className={cn(buttonVariants({ variant: "outline" }), "px-6")}>
              Стать практиком
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
