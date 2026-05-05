import { BriefcaseBusiness, CalendarDays, Handshake, ShieldCheck, Sparkles, Video } from "lucide-react";
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
