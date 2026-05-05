import Link from "next/link";
import { ArrowRight, BadgeCheck, BarChart3, BrainCircuit, FileCheck2, Globe2, WalletCards } from "lucide-react";

const benefits = [
  {
    icon: WalletCards,
    title: "Прозрачная комиссия",
    description: "Понятные условия, фиксированные цены и отсутствие поминутного давления на клиента.",
  },
  {
    icon: Globe2,
    title: "Онлайн-записи и платежи",
    description: "Клиенты бронируют и оплачивают встречу внутри платформы.",
  },
  {
    icon: FileCheck2,
    title: "Этика и жалобы",
    description: "Правила работы, жалобы и возвраты встроены в процесс, а не решаются в переписке.",
  },
  {
    icon: BrainCircuit,
    title: "Pro-инструменты",
    description: "AI-саммари, черновики follow-up и аналитика доступны по подписке практика.",
  },
  {
    icon: BarChart3,
    title: "Кабинет с аналитикой",
    description: "Расписание, история сессий, выплаты, рейтинг и заявки в одном месте.",
  },
  {
    icon: BadgeCheck,
    title: "Верификация",
    description: "Профиль показывает клиенту, что практик прошёл правила ETerapy.",
  },
];

export function ForPractitionersSection() {
  return (
    <section id="for-practitioners" className="soft-shell py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <div className="soft-eyebrow">для практиков</div>
          <h2 className="soft-h1 mt-3">
            Инфраструктура с <span className="soft-italic">честными условиями</span>
          </h2>
          <p className="soft-lede mt-5">
            Кабинет, расписание, выплаты, Pro-инструменты и прозрачная верификация
            в той же спокойной системе, что и клиентский путь.
          </p>
          <Link href="/practitioners/apply" className="soft-button soft-button-primary mt-7">
            Стать практиком
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <ul className="grid gap-x-8 gap-y-7 md:grid-cols-2">
          {benefits.map((benefit) => (
            <li key={benefit.title} className="grid grid-cols-[auto_1fr] gap-4">
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(214,117,88,0.14),transparent_72%)]">
                <benefit.icon className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              </span>
              <div>
                <h3 className="soft-h3 text-xl">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  {benefit.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
