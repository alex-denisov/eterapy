import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const tools = [
  {
    icon: "🃏",
    title: "Таро RWS",
    description: "Расклад на 3 карты, Карта дня или Кельтский крест. AI интерпретирует расклад в контексте вашего вопроса.",
    tag: "Популярное",
  },
  {
    icon: "⭐",
    title: "Натальная карта",
    description: "Полная карта вашего рождения по западной астрологии. Планеты, дома, аспекты — всё с интерпретацией.",
    tag: "Астрология",
  },
  {
    icon: "🔢",
    title: "Нумерология",
    description: "Число жизненного пути, число выражения и личности по системе Пифагора.",
    tag: "Быстро",
  },
  {
    icon: "🌙",
    title: "Гороскоп",
    description: "Персонализированный ежедневный, недельный и месячный прогноз на основе транзитов.",
    tag: "Ежедневно",
  },
  {
    icon: "💬",
    title: "AI Check-in",
    description: "3-5 рефлексивных вопросов → структурированный ответ. Инструмент самопознания за 2 минуты.",
    tag: "Наша разработка",
  },
  {
    icon: "📖",
    title: "AI Мини-гид",
    description: "Анкета → персональный текстовый гид по теме вашего запроса. Глубже, чем гороскоп.",
    tag: "Наша разработка",
  },
];

export function AIToolsSection() {
  return (
    <section id="ai-tools" className="bg-navy-light/50 px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-center text-3xl font-bold md:text-4xl">
          AI-инструменты
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Попробуй бесплатно — 3 сессии в месяц. Регистрация не нужна.
        </p>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Card
              key={tool.title}
              className="group border-border/40 bg-card/50 transition-colors hover:border-primary/30"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{tool.icon}</span>
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-xs text-primary"
                  >
                    {tool.tag}
                  </Badge>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{tool.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
