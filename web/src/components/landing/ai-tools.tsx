import Link from "next/link";
import { ArrowRight, FileText, Layers3, MessageSquareText, Route, ShieldCheck, UsersRound } from "lucide-react";

const tools = [
  {
    icon: MessageSquareText,
    title: "Первичный ответ",
    description: "Диалог от вопроса: 2-5 уточнений, краткое отражение и безопасный следующий шаг.",
    href: "/products/primary-answer",
    price: "бесплатно",
  },
  {
    icon: Layers3,
    title: "4 ракурса",
    description: "Рациональный, эмоциональный, символический и практический взгляд на один вопрос.",
    href: "/products/perspectives",
    price: "299 ₽",
  },
  {
    icon: FileText,
    title: "Глубокий отчет",
    description: "Развернутый результат по ситуации, доступный после оплаты или по подписке.",
    href: "/products/deep-report",
    price: "590 ₽",
  },
  {
    icon: ShieldCheck,
    title: "Разбор переписки",
    description: "Приватный анализ с явным согласием, предупреждением о данных и удалением источника.",
    href: "/products/chat-analysis",
    price: "390-1490 ₽",
  },
  {
    icon: UsersRound,
    title: "Совместимость",
    description: "Парный сценарий с invite flow и согласием второго участника до результата.",
    href: "/products/compatibility",
    price: "590-990 ₽",
  },
  {
    icon: Route,
    title: "7 дней к ясности",
    description: "Мягкий маршрут с ежедневными шагами, напоминаниями и итоговым отчетом.",
    href: "/products/seven-days",
    price: "990 ₽",
  },
];

export function AIToolsSection() {
  return (
    <section id="modalities" className="soft-shell py-16 md:py-24">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <div className="soft-eyebrow">Каталог форматов</div>
        <h2 className="soft-h1 mt-3">
          Углубление под <span className="soft-italic">ваш</span> вопрос
        </h2>
        <p className="soft-lede mt-4">
          Цифровые разборы, маршруты и переход к специалисту открываются как
          продолжение вопроса, а не как витрина ради выбора.
        </p>
      </div>

      <div className="soft-map-grid">
        {tools.map((tool, index) => (
          <Link
            key={tool.title}
            href={tool.href}
            className={[
              "soft-card soft-product-card col-span-12 flex min-h-52 flex-col p-6 md:col-span-6 lg:col-span-4",
              index === 0 ? "bg-[linear-gradient(150deg,#fffcf5,#f4d9c1)]" : "",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4">
              <tool.icon className="size-6 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span className="soft-badge soft-badge-warm">{tool.price}</span>
            </div>
            <h3 className="soft-h3 mt-5">{tool.title}</h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {tool.description}
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)]">
              Подробнее
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/products" className="soft-button soft-button-ghost">
          Все продукты
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
