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
        <h1 className="font-heading text-4xl font-bold leading-tight">О проекте ETerapy</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Диалоговая платформа ясности: помогает разобраться в жизненных вопросах через
          короткий диалог, разные ракурсы ответа, личную карту и проверенных специалистов.
        </p>
      </div>

      <div className="space-y-14">
        {/* Зачем мы */}
        <section>
          <h2 className="font-heading text-2xl font-semibold mb-4">Зачем мы существуем</h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Люди приходят с важными жизненными вопросами — об отношениях, карьере, семье,
              внутренних конфликтах — и не знают, с чего начать. Они выбирают между
              "поговорить с другом", "записаться к психологу" и "не делать ничего".
            </p>
            <p>
              ETerapy закрывает промежуток до этого выбора. Сначала диалог — чтобы
              сформулировать вопрос, увидеть его с разных сторон и понять следующий шаг.
              Специалист — когда нужна живая глубина. Личная карта — чтобы не теряться в
              повторяющихся темах.
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
                text: "Никаких угроз, манипуляций и запугивания. Специалисты проходят проверку и подписывают этический кодекс.",
              },
              {
                icon: "💰",
                title: "Честная цена",
                text: "Фиксированные тарифы. Никаких скрытых платежей. Оплата списывается после подтверждения — или не списывается вовсе.",
              },
              {
                icon: "🔒",
                title: "Конфиденциальность",
                text: "Диалоги и разборы хранятся только в вашей личной карте. Публикация — только с вашего согласия.",
              },
              {
                icon: "⭐",
                title: "Качество",
                text: "Реальные отзывы от верифицированных клиентов. Специалист рекомендуется только если его профиль подходит к теме вашего вопроса.",
              },
              {
                icon: "🤝",
                title: "Честность с практиком",
                text: "Стабильные выплаты, прозрачная комиссия, удобные инструменты для расписания и общения с клиентами.",
              },
              {
                icon: "✦",
                title: "Ясность без давления",
                text: "Ни один ответ платформы не является предсказанием, диагнозом или гарантией. Итоговое решение всегда остаётся за вами.",
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
              { n: 1, text: "Вы начинаете с вопроса — в свободной форме, без регистрации" },
              { n: 2, text: "Короткий диалог помогает уточнить суть и провести первичный разбор" },
              { n: 3, text: "Вы выбираете глубину: ракурсы, глубокий отчёт, разбор переписки, 7 дней к ясности или специалиста" },
              { n: 4, text: "Результаты сохраняются в Мою карту ETerapy — личное пространство вопросов и инсайтов" },
              { n: 5, text: "При необходимости — консультация с проверенным специалистом прямо на платформе" },
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
            ETerapy — платформа для рефлексии и осмысления жизненных вопросов.
            Все разборы, диалоги и консультации носят ознакомительный характер и не являются
            медицинской, психологической, юридической или финансовой помощью.
            Итоговые решения всегда остаются за пользователем.
            При признаках экстренной ситуации обратитесь к профильному специалисту или в экстренные службы.
          </p>
        </section>

        {/* CTA */}
        <div className="text-center space-y-4 pt-4">
          <p className="text-muted-foreground">Готовы начать с вопроса и понятного следующего шага?</p>
          <div className="flex gap-3 justify-center">
            <Link href="/checkin" className={cn(buttonVariants(), "px-6")}>
              Начать диалог
            </Link>
            <Link href="/practitioners/apply" className={cn(buttonVariants({ variant: "outline" }), "px-6")}>
              Стать специалистом
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
