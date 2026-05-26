import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/how-it-works");

const steps = [
  {
    step: "01",
    title: "Вы пишете своими словами",
    text: "Без формы, категорий и обязательных полей. Можно так, как рассказали бы близкому человеку: путано, эмоционально, с многоточиями.",
  },
  {
    step: "02",
    title: "Мы задаём 2–4 коротких вопроса",
    text: "Чтобы понять контекст: с чем связано, как давно, что уже пробовали, чего хочется на выходе. Любой вопрос можно пропустить.",
  },
  {
    step: "03",
    title: "Получаете первичный разбор",
    text: "Что мы услышали, главная развилка, что обратило внимание (факты / чувства / предположения), безопасный следующий шаг.",
  },
  {
    step: "04",
    title: "На странице ответа видны углубления",
    text: "Один рекомендуемый формат, несколько альтернатив, подписка как опция для регулярного использования и встречи со специалистами как отдельный следующий шаг.",
  },
  {
    step: "05",
    title: "Покупаете услугу напрямую или после triage",
    text: "4 ракурса, глубокий отчёт, переписка, совместимость, Таро, натальная карта, маршрут «7 дней» или встреча со специалистом доступны из каталога /products.",
  },
  {
    step: "06",
    title: "Сохраняете в карту",
    text: "Все разборы складываются в личную карту: видны темы, паттерны, повторы. Можно поделиться карточкой, можно удалить всё в один клик.",
  },
];

const productGroups = [
  ["Цифровые углубления", "4 ракурса, глубокий отчёт, переписка, совместимость, 7 дней к ясности и Моя карта."],
  ["Эзотерические форматы", "Таро, натальная карта и числовой портрет подаются как метафора, не как прогноз."],
  ["Живые встречи", "Психолог, коуч, юрист, эзотерик или совместная сессия. Цена видна до бронирования."],
];

export default function HowItWorksPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="how-it-works-page">
      <PublicJsonLd route="/how-it-works" />

      <section className="soft-shell" style={{ paddingTop: 64, paddingBottom: 24, maxWidth: 880, margin: "0 auto" }}>
        <p className="soft-eyebrow">как это работает</p>
        <h1 className="soft-h1 mt-3">
          От вопроса <span className="soft-italic">к ясности</span> — и дальше только по вашему выбору
        </h1>
        <p className="soft-lede mt-5">
          ETerapy не является маркетплейсом с витриной специалистов на первом экране.
          Основная воронка: вопрос → бесплатный первичный разбор → углубление → специалист, если нужен живой разговор.
        </p>

        {/* Quote card */}
        <div className="soft-card mt-8" style={{ padding: 28, background: "linear-gradient(160deg, #fffcf5, #f4d9c1)" }}>
          <p
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontStyle: "italic",
              fontSize: 24,
              color: "var(--soft-bordeaux)",
              lineHeight: 1.4,
            }}
          >
            «Диалог ясности → бесплатный первичный разбор → выбор углубления → результат → Моя карта → специалист при необходимости».
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[var(--soft-ink-faint)]">главная формула продукта</p>
        </div>

        {/* 5 steps */}
        <div className="mt-4 flex flex-col gap-4">
          {steps.map((s) => (
            <div
              key={s.step}
              className="soft-card"
              style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 24, alignItems: "center", padding: 22 }}
            >
              <span
                style={{
                  fontFamily: "var(--font-heading, serif)",
                  fontStyle: "italic",
                  fontSize: 44,
                  color: "var(--soft-terracotta-dark)",
                  lineHeight: 1,
                }}
              >
                {s.step}
              </span>
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-heading, serif)",
                    fontSize: 20,
                    lineHeight: 1.2,
                    color: "var(--soft-bordeaux)",
                    fontWeight: 500,
                    marginBottom: 8,
                  }}
                >
                  {s.title}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                  {s.text}
                </p>
              </div>
            </div>
        ))}
        </div>

        <div className="soft-card mt-8 p-6 md:p-8" style={{ background: "var(--soft-paper-deep)" }}>
          <p className="soft-eyebrow text-[var(--soft-bordeaux)]">если уже знаете, что нужно</p>
          <h2 className="soft-h2 mt-3">Откройте нужный формат <span className="soft-italic">напрямую</span></h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Бесплатный диалог — самый мягкий вход, но не обязательный. Если вы уже понимаете, что хотите расклад Таро,
            разбор переписки или встречу со специалистом, перейдите к нужному формату сразу.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {productGroups.map(([title, text]) => (
              <div key={title} className="soft-card p-4">
                <p className="font-semibold text-[var(--soft-bordeaux)]">{title}</p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">{text}</p>
              </div>
            ))}
          </div>
          <Link href="/products" className="soft-button soft-button-primary mt-6">
            Перейти в продукты
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Safety card */}
        <div className="soft-card mt-8" style={{ background: "var(--soft-bordeaux)", color: "#F4D9C1", padding: 28 }}>
          <p className="soft-eyebrow" style={{ color: "#F4D9C1", opacity: 0.7 }}>важно</p>
          <h3
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontSize: 20,
              fontWeight: 500,
              color: "#FBF0E1",
              marginTop: 8,
              marginBottom: 12,
            }}
          >
            Когда мы перенаправим к человеку
          </h3>
          <ul style={{ lineHeight: 1.7, paddingLeft: 18, color: "#E8C4B8", fontSize: 14.5 }}>
            <li>Если в разборе появляются мысли о самоповреждении — мы остановимся и дадим контакты экстренных служб.</li>
            <li>Если вопрос про насилие, угрозу безопасности, юридические или медицинские риски — направим к специалисту.</li>
            <li>Если за 2–3 разбора тема не сдвигается — предложим встречу с проверенным психологом, коучем или юристом.</li>
          </ul>
        </div>

        <div className="soft-card mt-8 p-6 md:p-8">
          <p className="soft-eyebrow">подписки</p>
          <h2 className="soft-h2 mt-3">Регулярно — <span className="soft-italic">выгоднее в подписке</span></h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Plus и Premium — для тех, кто возвращается к разборам не раз и хочет видеть свою историю,
            копить кредиты ясности, продолжать «Мою карту» и проходить маршруты со скидкой. Встречи со специалистами
            оплачиваются отдельно: работа живых людей всегда идёт по полной ставке.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/pricing" className="soft-button soft-button-ghost">Тарифы</Link>
            <Link href="/pricing/compare" className="soft-button soft-button-ghost">Сравнение тарифов</Link>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center" style={{ paddingBottom: 80 }}>
          <Link
            href="/checkin"
            className="soft-button soft-button-primary"
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
