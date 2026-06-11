import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/about");

const PRINCIPLES: { icon: string; title: string; text: string }[] = [
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
];

const STEPS: { n: number; text: string }[] = [
  { n: 1, text: "Вы начинаете с вопроса — в свободной форме, без регистрации" },
  { n: 2, text: "Короткий диалог помогает уточнить суть и провести первичный разбор" },
  { n: 3, text: "Вы выбираете глубину: полная картина, подробный разбор, разбор переписки, 7 дней к ясности или специалист" },
  { n: 4, text: "Результаты сохраняются в Мою карту ETerapy — личное пространство вопросов и инсайтов" },
  { n: 5, text: "При необходимости — консультация с проверенным специалистом прямо на платформе" },
];

export default function AboutPage() {
  return (
    <div className="soft-clarity-page min-h-screen">
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <PublicJsonLd route="/about" />

        {/* Hero */}
        <div className="mb-14 text-center">
          <p className="soft-eyebrow mb-3">о проекте</p>
          <h1
            className="font-heading text-4xl font-semibold leading-tight sm:text-5xl"
            style={{ color: "var(--soft-bordeaux)" }}
          >
            Платформа <span className="italic">ясности</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            ETerapy помогает разобраться в жизненных вопросах через короткий диалог, разные
            полную картину ответа, личную карту и проверенных специалистов.
          </p>
        </div>

        <div className="space-y-14">
          {/* Зачем мы */}
          <section>
            <h2 className="font-heading text-2xl font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Зачем мы существуем
            </h2>
            <div className="mt-4 space-y-4 leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
              <p>
                Люди приходят с важными жизненными вопросами — об отношениях, карьере, семье,
                внутренних конфликтах — и не знают, с чего начать. Они выбирают между
                «поговорить с другом», «записаться к психологу» и «не делать ничего».
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
            <h2 className="font-heading text-2xl font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Наши принципы
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {PRINCIPLES.map((item) => (
                <div key={item.title} className="soft-card p-5">
                  <div className="mb-3 text-2xl">{item.icon}</div>
                  <h3 className="font-heading text-lg font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Как работает */}
          <section>
            <h2 className="font-heading text-2xl font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Как работает платформа
            </h2>
            <div className="mt-6 space-y-3">
              {STEPS.map((step) => (
                <div key={step.n} className="flex items-start gap-4">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: "var(--soft-apricot)", color: "var(--soft-bordeaux)" }}
                  >
                    {step.n}
                  </div>
                  <p className="pt-1 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                    {step.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Правовая позиция */}
          <section
            className="soft-card-flat p-6"
            style={{ border: "1px solid var(--soft-paper-edge)" }}
          >
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Правовая позиция
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
              ETerapy — платформа для рефлексии и осмысления жизненных вопросов.
              Все разборы, диалоги и консультации носят ознакомительный характер и не являются
              медицинской, психологической, юридической или финансовой помощью.
              Итоговые решения всегда остаются за пользователем.
              При признаках экстренной ситуации обратитесь к профильному специалисту или в экстренные службы.
            </p>
          </section>

          {/* CTA */}
          <div className="space-y-4 pt-2 text-center">
            <p style={{ color: "var(--soft-ink-soft)" }}>
              Готовы начать с вопроса и понятного следующего шага?
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/checkin" className="soft-button soft-button-primary">
                Начать диалог
              </Link>
              <Link href="/practitioners/apply" className="soft-button soft-button-ghost">
                Стать специалистом
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
