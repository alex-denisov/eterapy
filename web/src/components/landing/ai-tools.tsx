import Link from "next/link";
import { FileText, Layers3, MessageSquareText, Route, ShieldCheck, UsersRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const tools = [
  {
    icon: MessageSquareText,
    title: "Первичный ответ",
    description: "Question-first диалог: 2-5 уточнений, краткое отражение и безопасный следующий шаг.",
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
    <section id="modalities" className="bg-navy-light/50 px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-center text-3xl font-bold md:text-4xl">
          Что можно углубить после ответа
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Сервисы открываются как продолжение вопроса, а не как витрина ради выбора.
        </p>

        <div className="mt-8 text-center">
          <Link href="/products" className={cn(buttonVariants({ variant: "outline" }), "border-primary/30 text-primary hover:bg-primary/10")}>
            Все продукты →
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link key={tool.title} href={tool.href}>
              <Card className="group h-full cursor-pointer border-border/40 bg-card/50 transition-colors hover:border-primary/30">
                <CardContent className="p-6">
                  <tool.icon className="size-5 text-primary" />
                  <h3 className="mt-4 text-lg font-semibold">{tool.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
