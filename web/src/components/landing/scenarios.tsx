import Link from "next/link";
import { ArrowRight, Compass, MessageCircleHeart, Users } from "lucide-react";

// B374: three scenario-routers under the hero for people who are not ready to
// type a question yet. They never compete with the dialogue — each one leads
// either back into a разбор or into the grouped catalog / specialists.
// No individual service cards from the 21-item catalog live here.
const scenarios = [
  {
    href: "/products",
    icon: Compass,
    eyebrow: "понять ситуацию",
    title: "Разобраться самому",
    text: "Полная картина, разбор переписки, решение вопроса — короткие цифровые разборы по одному запросу.",
    cta: "Открыть разборы",
    gradient: "linear-gradient(150deg, #F4D9C1, #F8E6D1)",
    testid: "understand",
  },
  {
    href: "/products/pair",
    icon: Users,
    eyebrow: "разобраться вместе",
    title: "Свериться с близким",
    text: "Сравнить взгляды с партнёром, родителем или другом и проверить совместимость — бережно, без раскрытия личных ответов.",
    cta: "Пригласить",
    gradient: "linear-gradient(150deg, #E8C4B8, #F4D5C8)",
    testid: "together",
  },
  {
    href: "/practitioners",
    icon: MessageCircleHeart,
    eyebrow: "поговорить со специалистом",
    title: "Живой разговор",
    text: "Психолог, коуч или эзотерик, когда хочется, чтобы услышал человек. Цена видна до бронирования.",
    cta: "Выбрать специалиста",
    gradient: "linear-gradient(150deg, #DBD3EA, #E8E1F2)",
    testid: "specialist",
  },
] as const;

export function ScenariosSection() {
  return (
    <section className="soft-shell py-12 md:py-20" data-testid="v5-home-scenarios">
      <div className="mx-auto mb-7 max-w-3xl text-center">
        <p className="soft-eyebrow">или выберите, с чего начать</p>
        <h2 className="soft-h1 mt-3">
          Три пути <span className="soft-italic">к ответу</span>
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {scenarios.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="soft-card flex flex-col p-6 text-left transition-transform hover:-translate-y-1 hover:shadow-[var(--soft-shadow-md)]"
              style={{ background: item.gradient }}
              data-analytics-event="scenario_clicked"
              data-analytics-target={item.href}
              data-testid={`v5-scenario-${item.testid}`}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-white/55 backdrop-blur">
                <Icon className="size-5 text-[var(--soft-bordeaux)]" aria-hidden="true" />
              </span>
              <p className="soft-eyebrow mt-4">{item.eyebrow}</p>
              <h3 className="soft-h3 mt-1">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {item.text}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-bordeaux)]">
                {item.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
