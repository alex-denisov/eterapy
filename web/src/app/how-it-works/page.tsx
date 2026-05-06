import Link from "next/link";
import { ArrowRight } from "lucide-react";
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

      <section className="soft-shell soft-public-section" style={{ paddingBlock: "clamp(3rem, 7vw, 6rem) clamp(2rem, 5vw, 4rem)" }}>
        <p className="soft-eyebrow">Путь ETerapy v5</p>
        <h1 className="soft-h1 mt-4" style={{ maxWidth: "42rem" }}>От вопроса к ясному следующему шагу</h1>
        <p className="soft-lede mt-5" style={{ maxWidth: "36rem" }}>
          v5 убирает выбор из каталога как первый шаг. Сначала платформа помогает понять ситуацию,
          затем предлагает глубину продукта или специалиста, если это уместно.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/checkin"
            className="soft-button soft-button-primary"
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/checkin"
            data-testid="how-it-works-dialogue-cta"
          >
            Задать вопрос
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/pricing" className="soft-button soft-button-ghost">
            Тарифы
          </Link>
        </div>
      </section>

      <section className="soft-shell soft-public-section" aria-label="Путь пользователя">
        <div className="soft-timeline">
          {stages.map((stage) => (
            <article key={stage.step} className="soft-card soft-timeline-item md:grid-cols-[4rem_minmax(0,1fr)_18rem]">
              <span className="soft-step-number">{stage.step}</span>
              <div>
                <h2 className="soft-h3">{stage.title}</h2>
                <p className="mt-2 leading-relaxed text-[var(--soft-ink-soft)]">{stage.text}</p>
              </div>
              <ul className="flex flex-wrap gap-2 text-sm text-[var(--soft-ink-soft)] md:block md:space-y-2">
                {stage.mechanics.map((item) => (
                  <li key={item} className="soft-chip">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="soft-card soft-form-panel">
          <h2 className="soft-h2">Защитные механики</h2>
          <div className="soft-public-grid-2 mt-5">
            {safeguards.map((item) => (
              <div key={item} className="soft-card-flat p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
