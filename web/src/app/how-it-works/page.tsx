import Link from "next/link";
import { ArrowRight, LockKeyhole, MessageCircle, Route, Sparkles } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/how-it-works");

const stages = [
  {
    step: "01",
    title: "Вопрос вместо каталога",
    text: "Пользователь начинает с живой формулировки ситуации. Система не просит выбирать практика до того, как понятен контекст.",
    mechanics: ["анонимная сессия", "SEO-атрибуция источника", "сохранение после момента ценности"],
  },
  {
    step: "02",
    title: "Уточняющий диалог",
    text: "Диалог задает 2-5 коротких вопросов, распознает сложность темы и останавливает кризисные сценарии до монетизации.",
    mechanics: ["быстрые ответы", "пропуск уточнений", "восстановление после обновления", "Экстренная поддержка"],
  },
  {
    step: "03",
    title: "Бесплатный первичный ответ",
    text: "Пользователь получает структурированное отражение: что происходит, какие есть перспективы и какой следующий шаг уместен.",
    mechanics: ["сохранить", "поделиться", "углубить", "нет платного CTA в кризисе"],
  },
  {
    step: "04",
    title: "Платная глубина или подписка",
    text: "Если нужно больше, ETerapy предлагает deep report, перспективы, совместимость, 7-дневный маршрут или подписку.",
    mechanics: ["entitlement", "пробный период", "отмена", "повтор после ошибки оплаты"],
  },
  {
    step: "05",
    title: "Специалист как следующий шаг",
    text: "Практик появляется не как витрина, а как рекомендация после контекста: 2-3 специалиста, rationale, формат и цена.",
    mechanics: ["объяснение рекомендации", "фиксированные пакеты", "уведомления о записи"],
  },
];

const safeguards = [
  "медицинские, юридические и финансовые темы получают безопасную направляющую копию",
  "кризисные запросы фиксируются для аудита безопасности и не показывают платные предложения",
  "Telegram/email/web уведомления зависят от согласий и preference center",
  "платные результаты открываются только через entitlement, а не через UI-состояние",
];

export default function HowItWorksPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="how-it-works-page">
      <PublicJsonLd route="/how-it-works" />

      <section className="soft-shell soft-public-hero">
        <div>
          <p className="soft-eyebrow">как это работает</p>
          <h1 className="soft-h1 mt-4">
            Тёплый, короткий путь от <span className="soft-italic">«не понимаю, что со мной»</span> к ясному следующему шагу
          </h1>
          <div className="soft-card soft-public-quote mt-8">
            «ETerapy — это не предсказание и не терапия. Это пространство, где можно
            сформулировать важный вопрос — и услышать его в полной тишине».
          </div>
        </div>
        <aside className="soft-card soft-public-side-note" aria-label="Суть механики ETerapy">
          <p className="soft-eyebrow">в центре сценария</p>
          <h2 className="soft-h3 mt-3">Один вопрос, несколько бережных шагов</h2>
          <div className="mt-5 grid gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            {[
              { icon: MessageCircle, text: "Сначала живой вопрос и уточнения, а не выбор специалиста." },
              { icon: Sparkles, text: "Первичный ответ остается бесплатным моментом ценности." },
              { icon: Route, text: "Платное углубление появляется только если оно уместно." },
              { icon: LockKeyhole, text: "Приватность и безопасность встроены в каждый шаг." },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-3">
                <span className="soft-step-number shrink-0" style={{ width: "2.1rem" }}>
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="soft-shell soft-public-section" aria-label="Путь пользователя">
        <div className="soft-timeline">
          {stages.map((stage) => (
            <article key={stage.step} className="soft-card soft-timeline-item md:grid-cols-[4rem_minmax(0,1fr)_3.5rem]">
              <span className="soft-step-number">{stage.step}</span>
              <div>
                <h2 className="soft-h3">{stage.title}</h2>
                <p className="mt-2 leading-relaxed text-[var(--soft-ink-soft)]">{stage.text}</p>
              </div>
              <span className="hidden text-3xl text-[var(--soft-ink-faint)] md:block" aria-hidden="true">✦</span>
            </article>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="soft-card soft-form-panel">
          <h2 className="soft-h2">Когда мы перенаправим к человеку</h2>
          <div className="soft-public-grid-2 mt-5">
            {safeguards.map((item) => (
              <div key={item} className="soft-card-flat p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {item}
              </div>
            ))}
          </div>
          <Link
            href="/checkin"
            className="soft-button soft-button-primary mt-6"
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/checkin"
            data-testid="how-it-works-dialogue-cta"
          >
            Начать диалог
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
