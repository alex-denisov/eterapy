import { ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, Handshake, ShieldCheck, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { ApplyForm } from "./apply-form";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/practitioners/apply");

const BENEFITS = [
  { icon: Sparkles, title: "Рекомендательный поток", desc: "Клиенты приходят после вопроса и первичного контекста, а не из холодного каталога." },
  { icon: CalendarDays, title: "Удобное расписание", desc: "Вы управляете слотами, рабочими часами и доступностью через кабинет." },
  { icon: BriefcaseBusiness, title: "Прозрачная оплата", desc: "Фиксированные пакеты, понятная комиссия и выплаты по правилам платформы." },
  { icon: ShieldCheck, title: "Этическая рамка", desc: "Проверка, кодекс и безопасная работа без запугивания и давления." },
  { icon: Video, title: "Сессии в браузере", desc: "Видеочат, история записей и поддержка без дополнительных установок." },
  { icon: Handshake, title: "Pro-инструменты", desc: "AI-саммари, контекст по согласию и черновики follow-up после запуска." },
];

const STEPS = [
  { n: "01", title: "Заполните форму", desc: "Расскажите о специализации, опыте и подходе к работе." },
  { n: "02", title: "Короткое знакомство", desc: "Команда связывается для проверки профиля и этической рамки." },
  { n: "03", title: "Настройка профиля", desc: "Профиль, услуги, пакеты и календарь проходят модерацию." },
  { n: "04", title: "Первые запросы", desc: "Клиенты приходят из рекомендательного слоя после своего диалога." },
];

const PRACTITIONER_TIERS = [
  {
    name: "Practitioner Basic",
    price: "0 ₽",
    desc: "Старт без ежемесячной платы: профиль, базовая витрина, заявки из ETerapy и ссылка предразбора.",
    perks: ["профиль после модерации", "базовый календарь", "личная ссылка предразбора", "комиссия по факту сессии"],
    tone: "var(--soft-paper-card)",
  },
  {
    name: "Practitioner Pro",
    price: "1 490 ₽ / мес",
    desc: "Инструменты для регулярной работы, когда поток клиентов уже есть.",
    perks: ["расширенная аналитика", "AI-саммари встреч", "управление услугами", "виджет для сайта"],
    tone: "linear-gradient(160deg, #d6decc, #e5ebdc)",
  },
  {
    name: "Practitioner Pro+",
    price: "2 990 ₽ / мес",
    desc: "Для специалистов и мини-команд с несколькими форматами и совместными сессиями.",
    perks: ["приоритет модерации", "compliance-проверки", "пакеты и программы", "расширенные precheck-ссылки"],
    tone: "linear-gradient(160deg, #dbd3ea, #e8e1f2)",
  },
];

const COMMISSIONS = [
  ["Клиент из ETerapy", "20–25%", "рекомендации, каталог, совместные сессии и защита платежа"],
  ["Клиент по личной ссылке", "20/17/14%", "BYOC-ссылка специалиста; founding-когорта временно 12%"],
  ["Пилотный специалист", "10–15%", "ограниченный срок и ручное согласование условий"],
];

export default function PractitionerApplyPage() {
  return (
    <main className="soft-clarity-page soft-public-page">
      <PublicJsonLd route="/practitioners/apply" />

      <section className="soft-shell soft-public-hero-centered">
        <p className="soft-eyebrow">Для практиков</p>
        <h1 className="soft-h1 mt-4">Станьте практиком ETerapy</h1>
        <p className="soft-lede mt-5">
          Платформа для бережной онлайн-работы со взрослыми клиентами: вопрос, первичный контекст,
          рекомендация специалиста и понятная запись без давления.
        </p>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="soft-public-grid">
          {BENEFITS.map((benefit) => (
            <article key={benefit.title} className="soft-card soft-plan-card">
              <benefit.icon className="size-6 text-[var(--soft-terracotta)]" aria-hidden="true" />
              <h2 className="mt-4 font-semibold text-[var(--soft-bordeaux)]">{benefit.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{benefit.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <h2 className="soft-h2 text-center">Как попасть на платформу</h2>
        <div className="soft-public-grid-2 mt-6">
          {STEPS.map((step) => (
            <article key={step.n} className="soft-card soft-timeline-item">
              <span className="soft-step-number">{step.n}</span>
              <div>
                <h3 className="font-semibold text-[var(--soft-bordeaux)]">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{step.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="mb-6 text-center">
          <p className="soft-eyebrow">тарифы практиков</p>
          <h2 className="soft-h2 mt-3">От бесплатного профиля до Pro-инструментов</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Эти тарифы не показываются на клиентской странице `/pricing`, чтобы не создавать ощущение,
            что специалист обязан иметь подписку для работы с клиентом.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PRACTITIONER_TIERS.map((tier) => (
            <article key={tier.name} className="soft-card p-6" style={{ background: tier.tone }}>
              <p className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">{tier.name}</p>
              <p className="mt-2 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{tier.price}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{tier.desc}</p>
              <div className="mt-5 grid gap-2">
                {tier.perks.map((perk) => (
                  <span key={perk} className="flex items-start gap-2 text-sm text-[var(--soft-ink-soft)]">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    {perk}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="soft-card p-6 md:p-8" style={{ background: "linear-gradient(140deg, #fffcf5, #f4d9c1)" }}>
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="soft-eyebrow text-[var(--soft-bordeaux)]">комиссия платформы</p>
              <h2 className="soft-h2 mt-3">Понятно до первой заявки</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Комиссия удерживается с оплаченной сессии. В неё входят эквайринг, эскроу-удержание,
                жалобы, антифрод, базовая поддержка и безопасный контекст предразбора по согласию клиента.
              </p>
              <Link href="#apply-form" className="soft-button soft-button-primary mt-6">
                Подать заявку
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-3">
              {COMMISSIONS.map(([title, value, desc]) => (
                <div key={title} className="soft-card-flat grid gap-3 p-4 md:grid-cols-[7rem_1fr] md:items-center">
                  <div className="font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{value}</div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--soft-ink)]">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="apply-form" className="soft-shell-narrow soft-public-section">
        <div className="soft-card soft-form-panel">
          <div className="mb-8 text-center">
            <p className="soft-eyebrow">Заявка</p>
            <h2 className="soft-h2 mt-3">Расскажите о своей практике</h2>
            <p className="mt-3 text-sm text-[var(--soft-ink-faint)]">
              Ответим в течение 1-2 рабочих дней.
            </p>
          </div>
          <ApplyForm />
        </div>

        <p className="mt-8 text-center text-xs text-[var(--soft-ink-faint)]">
          Регистрация практика возможна только после проверки заявки администратором.
          Самостоятельная регистрация через стандартную форму не дает статус практика.
        </p>
      </section>
    </main>
  );
}
