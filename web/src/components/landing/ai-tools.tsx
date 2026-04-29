import Link from "next/link";
import { FileText, Layers3, MessageSquareText, Route, ShieldCheck, UsersRound } from "lucide-react";
import { PremiumCard, PremiumSection } from "@/components/v5/premium";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const tools = [
  {
    icon: MessageSquareText,
    title: "Первичный ответ",
    description: "Диалог от вопроса: 2-5 уточнений, краткое отражение и безопасный следующий шаг.",
    href: "/products/primary-answer",
  },
  {
    icon: Layers3,
    title: "4 ракурса",
    description: "Рациональный, эмоциональный, символический и практический взгляд на один вопрос.",
    href: "/products/perspectives",
  },
  {
    icon: FileText,
    title: "Глубокий отчет",
    description: "Развернутый результат по ситуации, доступный после оплаты или по подписке.",
    href: "/products/deep-report",
  },
  {
    icon: ShieldCheck,
    title: "Разбор переписки",
    description: "Приватный анализ с явным согласием, предупреждением о данных и удалением источника.",
    href: "/products/chat-analysis",
  },
  {
    icon: UsersRound,
    title: "Совместимость",
    description: "Парный сценарий с invite flow и согласием второго участника до результата.",
    href: "/products/compatibility",
  },
  {
    icon: Route,
    title: "7 дней к ясности",
    description: "Мягкий маршрут с ежедневными шагами, напоминаниями и итоговым отчетом.",
    href: "/products/seven-days",
  },
];

export function AIToolsSection() {
  return (
    <PremiumSection
      className="px-4"
      eyebrow="Сценарии"
      title={<>Что можно углубить <span className="text-brand-soft-gold">после ответа</span></>}
      lead="Сервисы открываются как продолжение вопроса, а не как витрина ради выбора."
    >
        <div id="modalities" className="mb-7">
          <Link href="/products" className={cn(buttonVariants({ variant: "outline" }), "border-primary/30 text-primary hover:bg-primary/10")}>
            Все продукты
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link key={tool.title} href={tool.href}>
              <PremiumCard tone={tool.title === "Совместимость" || tool.title === "7 дней к ясности" ? "lavender" : "gold"} className="group h-full cursor-pointer transition-transform hover:-translate-y-1">
                  <tool.icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-4 font-heading text-2xl font-medium">{tool.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
              </PremiumCard>
            </Link>
          ))}
        </div>
    </PremiumSection>
  );
}
