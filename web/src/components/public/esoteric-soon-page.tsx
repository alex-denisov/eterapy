import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, Heart, Lock, Sparkles } from "lucide-react";

type EsotericProduct = {
  title: string;
  description: string;
  price: string;
  icon: LucideIcon;
};

type EsotericServicePageProps = {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  quote: string;
  accent: string;
  paper: string;
  glyph: LucideIcon;
  products: EsotericProduct[];
};

export function EsotericServicePage({
  eyebrow,
  title,
  subtitle,
  quote,
  accent,
  paper,
  glyph: Glyph,
  products,
}: EsotericServicePageProps) {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="esoteric-service-page">
      <section className="soft-shell py-12 md:py-16">
        <Link href="/" className="soft-chip soft-chip-warm">
          На главную
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="soft-badge soft-badge-lilac">доступно сейчас</span>
              <span className="text-xs text-[var(--soft-ink-faint)]">цифровой формат и специалисты ETerapy</span>
            </div>
            <p className="soft-eyebrow mt-6" style={{ color: accent }}>
              {eyebrow}
            </p>
            <h1 className="soft-display mt-3" style={{ maxWidth: "48rem" }}>
              {title}
            </h1>
            <p className="soft-lede mt-5" style={{ maxWidth: "45rem" }}>
              {subtitle}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/checkin" className="soft-button soft-button-primary">
                Начать с вопроса
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/products" className="soft-button soft-button-ghost">
                Посмотреть все форматы
              </Link>
            </div>
          </div>

          <aside
            className="soft-card relative overflow-hidden p-9 text-center md:p-12"
            style={{ background: paper }}
            aria-label="Принцип направления"
          >
            <span
              className="absolute inset-x-12 top-10 h-20 rounded-full blur-3xl"
              style={{ backgroundColor: accent, opacity: 0.16 }}
              aria-hidden="true"
            />
            <Glyph className="relative mx-auto size-16" style={{ color: accent, opacity: 0.75 }} aria-hidden="true" />
            <p className="relative mt-6 text-2xl italic leading-snug" style={{ color: accent, fontFamily: "var(--font-heading)" }}>
              {quote}
            </p>
          </aside>
        </div>

        <section className="soft-card mt-12 bg-[var(--soft-paper-deep)] p-6 md:p-8">
          <p className="soft-eyebrow text-[var(--soft-bordeaux)]">принцип ETerapy</p>
          <h2 className="soft-h3 mt-3">Мы относимся к этому как к языку метафор, не как к предсказанию</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Эзотерические форматы помогают говорить о себе и важных решениях другим словарём. Мы не обещаем точных
            прогнозов, не заменяем психолога или врача и не используем страх как способ продажи.
          </p>
        </section>

        <section className="mt-12">
          <p className="soft-eyebrow mb-5">форматы внутри направления</p>
          <div className="soft-map-grid">
            {products.map((product) => {
              const Icon = product.icon;
              return (
                <article key={product.title} className="soft-card col-span-12 p-6 md:col-span-6 lg:col-span-4">
                  <div className="flex items-start justify-between gap-4">
                    <Icon className="size-6" style={{ color: accent }} aria-hidden="true" />
                    <span className="soft-badge soft-badge-warm">{product.price}</span>
                  </div>
                  <h3 className="soft-h3 mt-5">{product.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{product.description}</p>
                  <Link href="/checkin" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)]">
                    Начать с вопроса
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="soft-card mt-8 p-6 md:p-8" style={{ background: "linear-gradient(140deg, #ded3ec, #f3e4ee)" }}>
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="soft-eyebrow text-[#4a3e5e]">совместный формат</p>
              <h2 className="soft-h3 mt-3 text-[#4a3e5e]">Соединить с психотерапевтом</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#4a3e5e]">
                Разбор продолжает живой специалист, чтобы метафора не осталась без контекста и практического шага.
              </p>
            </div>
            <Link href="/products/joint-session" className="soft-button soft-button-ghost shrink-0">
              Узнать про совместные
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

export const EsotericSoonPage = EsotericServicePage;

export function JointSessionPage() {
  const sections = [
    {
      icon: Sparkles,
      title: "Эзотерик · 30 минут",
      tone: "#4a3e5e",
      bg: "linear-gradient(160deg, #dbd3ea, #eee6f5)",
      items: [
        "расклад, натальная карта или числовой портрет по запросу",
        "символический разбор без катастрофических трактовок",
        "выделение тем для дальнейшей работы",
      ],
    },
    {
      icon: Heart,
      title: "Психотерапевт · 30 минут",
      tone: "#3a4a36",
      bg: "linear-gradient(160deg, #d6decc, #eff2e8)",
      items: [
        "проверка реальности и контекста",
        "работа с чувствами, которые поднимет разбор",
        "безопасный следующий шаг: практический, не «знаковый»",
      ],
    },
  ];

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="joint-session-page">
      <section className="soft-shell py-12 md:py-16">
        <Link href="/products" className="soft-chip soft-chip-warm">
          К продуктам
        </Link>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="soft-badge soft-badge-lilac">доступно сейчас</span>
          <span className="text-xs text-[var(--soft-ink-faint)]">уникальный для ETerapy формат</span>
        </div>

        <p className="soft-eyebrow mt-6">совместная сессия</p>
        <h1 className="soft-display mt-3" style={{ maxWidth: "48rem" }}>
          Эзотерик и <span className="soft-italic">психотерапевт</span> в одной встрече
        </h1>
        <p className="soft-lede mt-5" style={{ maxWidth: "45rem" }}>
          Один час, два специалиста. Эзотерик предлагает символический язык, психотерапевт удерживает реальность,
          контекст и безопасный следующий шаг.
        </p>

        <div className="mt-9 grid gap-4 md:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <article key={section.title} className="soft-card p-6 md:p-8" style={{ background: section.bg }}>
                <Icon className="size-7" style={{ color: section.tone }} aria-hidden="true" />
                <h2 className="soft-h3 mt-4" style={{ color: section.tone }}>
                  {section.title}
                </h2>
                <ul className="mt-4 grid gap-3 text-sm leading-relaxed" style={{ color: section.tone }}>
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <section className="soft-card mt-8 bg-[var(--soft-bordeaux)] p-6 text-[var(--soft-paper)] md:p-8">
          <div className="flex items-center gap-3">
            <Lock className="size-5 text-[var(--soft-gold)]" aria-hidden="true" />
            <p className="soft-eyebrow text-[var(--soft-gold)]">что не происходит</p>
          </div>
          <ul className="mt-4 grid gap-3 text-sm leading-relaxed text-[#e8c4b8] md:grid-cols-2">
            <li>нет «диагнозов по карте» — ни эзотерических, ни медицинских;</li>
            <li>нет прогнозов как фактов — есть темы и развилки;</li>
            <li>специалисты не спорят между собой, а работают по согласованному протоколу;</li>
            <li>встреча не отменяет терапию и не претендует на её роль.</li>
          </ul>
        </section>

        <section className="soft-card mt-8 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="soft-eyebrow">формат и цена</p>
              <h2 className="soft-h3 mt-3">60 минут · видеовстреча</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Оплата делится между двумя специалистами по их полной ставке. ETerapy удерживает сервисный сбор за
                организацию, без скидок на встречи.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <p className="text-4xl font-semibold text-[var(--soft-bordeaux)]" style={{ fontFamily: "var(--font-heading)" }}>от 4 500 ₽</p>
              <Link href="/checkin" className="soft-button soft-button-primary">
                Начать с вопроса
              </Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
