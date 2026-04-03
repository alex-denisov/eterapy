import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const tools = [
  {
    href: "/tools/tarot",
    icon: "🃏",
    title: "Расклад Таро",
    description: "Три карты: Прошлое · Настоящее · Будущее. AI-интерпретация.",
    tag: "Популярное",
  },
  {
    href: "/tools/checkin",
    icon: "💬",
    title: "AI Check-in",
    description: "Рефлексивные вопросы → структурированный ответ за 2 минуты.",
    tag: "Наша разработка",
  },
  {
    href: "/tools/natal",
    icon: "⭐",
    title: "Натальная карта",
    description: "Описание натальной карты по дате рождения.",
    tag: "Астрология",
  },
  {
    href: "/tools/numerology",
    icon: "🔢",
    title: "Нумерология",
    description: "Число жизненного пути по системе Пифагора.",
    tag: "Быстро",
  },
  {
    href: "/tools/horoscope",
    icon: "🌙",
    title: "Гороскоп",
    description: "Персонализированный ежедневный, недельный или месячный прогноз.",
    tag: "Ежедневно",
  },
  {
    href: "/tools/guide",
    icon: "📖",
    title: "AI Мини-гид",
    description: "Персональный текстовый гид по теме вашего запроса.",
    tag: "Наша разработка",
  },
];

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        AI-инструменты
      </h1>
      <p className="mt-2 text-muted-foreground">
        Бесплатные инструменты самопознания. 3 сессии в месяц.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link key={tool.title} href={tool.href} className="group">
            <Card className="h-full border-border/40 bg-card/50 transition-colors group-hover:border-primary/30">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{tool.icon}</span>
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-xs text-primary"
                  >
                    {tool.tag}
                  </Badge>
                </div>
                <h3 className="mt-3 font-semibold">{tool.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tool.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground/60">
        Все AI-инструменты носят развлекательный и ознакомительный характер.
      </p>
    </div>
  );
}
