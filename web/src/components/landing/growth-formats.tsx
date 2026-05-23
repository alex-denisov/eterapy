import Link from "next/link";
import { ArrowRight, Check, Heart, Sparkles, Users } from "lucide-react";

const formats = [
  {
    href: "/circle",
    icon: Users,
    title: "Круг ясности",
    text: "Пригласите 2–5 близких. Они ответят на один вопрос, а ETerapy соберёт бережный общий итог.",
    cta: "Создать круг",
    className: "from-[#F4D9C1] to-[#F8E6D1]",
  },
  {
    href: "/pair",
    icon: Heart,
    title: "Разобраться вдвоём",
    text: "Сравните взгляды с партнёром, родителем или коллегой без давления, спора и раскрытия личных ответов до согласия.",
    cta: "Пригласить",
    className: "from-[#E8C4B8] to-[#F4D5C8]",
  },
  {
    href: "/telegram",
    icon: Sparkles,
    title: "В Telegram · 30 секунд",
    text: "Открывается прямо в чате: карта дня, мягкие напоминания и быстрый вход в диалог.",
    cta: "Открыть бот",
    className: "from-[#DBD3EA] to-[#E8E1F2]",
  },
];

export function GrowthFormatsSection() {
  return (
    <section className="soft-shell py-16 md:py-24" data-testid="v41-growth-formats">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="soft-eyebrow">взгляд со стороны</p>
        <h2 className="soft-h1 mt-3">
          Ясность <span className="soft-italic">вдвоём</span> и в кругу
        </h2>
        <p className="soft-lede mt-4">
          Бережные форматы для тех, кому доверяете. Иногда взгляд другого —
          единственное, чего не хватает.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {formats.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`soft-card bg-gradient-to-br ${item.className} p-7 text-left transition-transform hover:-translate-y-1 hover:shadow-[var(--soft-shadow-md)]`}
              data-testid={`v41-growth-${item.href.slice(1)}`}
            >
              <Icon className="size-7 text-[var(--soft-bordeaux)]" aria-hidden="true" />
              <h3 className="soft-h3 mt-4">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{item.text}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-bordeaux)]">
                {item.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="soft-card mt-6 grid gap-6 p-7 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <p className="soft-eyebrow">ежедневная практика</p>
          <h3 className="soft-h2 mt-3">
            5 минут в день — <span className="soft-italic">за месяц 30 страниц</span> вашей внутренней карты
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Один вопрос, один ракурс, один маленький шаг. За каждый день —
            кредит ясности, который можно потратить на цифровые форматы.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/products/clarity-practice" className="soft-button soft-button-primary">
              Начать практику
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/missions" className="soft-button soft-button-ghost">
              Все задания практики
            </Link>
          </div>
        </div>
        <div className="rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-5">
          <p className="soft-eyebrow mb-4">эта неделя</p>
          <div className="grid grid-cols-7 gap-1.5">
            {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((day, index) => (
              <div
                key={day}
                className={[
                  "grid aspect-square place-items-center rounded-[10px] border text-xs font-semibold",
                  index < 3
                    ? "border-[var(--soft-terracotta-dark)] bg-[var(--soft-terracotta-dark)] text-[#FBF0E1]"
                    : index === 3
                      ? "border-[var(--soft-apricot)] bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)]"
                      : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-faint)]",
                ].join(" ")}
              >
                {index < 3 ? <Check className="size-3.5" aria-hidden="true" /> : day}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--soft-ink-faint)]">11 дней практики подряд · +14 кредитов ясности</p>
        </div>
      </div>
    </section>
  );
}
