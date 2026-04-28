import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const tools = [
  {
    icon: "💬",
    title: "Первичный ответ",
    description: "Question-first диалог: 2-5 уточнений, краткое отражение и безопасный следующий шаг.",
    tag: "Старт v5",
    href: "/all-modalities/checkin",
  },
  {
    icon: "🃏",
    title: "Расклад Таро",
    description: "Три карты на ваш вопрос с развёрнутой интерпретацией. Классическая колода Райдера-Уэйта.",
    tag: "Популярное",
    href: "/all-modalities/tarot",
  },
  {
    icon: "⭐",
    title: "Натальная карта",
    description: "Полная карта вашего рождения по западной астрологии. Планеты, дома, аспекты — с описанием.",
    tag: "Астрология",
    href: "/all-modalities/natal",
  },
  {
    icon: "🔢",
    title: "Нумерология",
    description: "Число жизненного пути, число выражения и личности по системе Пифагора.",
    tag: "Быстро",
    href: "/all-modalities/numerology",
  },
  {
    icon: "🌙",
    title: "Гороскоп",
    description: "Персонализированный прогноз на день, неделю или месяц на основе текущих транзитов.",
    tag: "Ежедневно",
    href: "/all-modalities/horoscope",
  },
  {
    icon: "📖",
    title: "Личный гид",
    description: "Короткая анкета → персональный текст по теме вашего запроса. Глубже, чем стандартный гороскоп.",
    tag: "Наша разработка",
    href: "/all-modalities/guide",
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
          <Link href="/all-modalities" className={cn(buttonVariants({ variant: "outline" }), "border-primary/30 text-primary hover:bg-primary/10")}>
            Все сервисы →
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link key={tool.title} href={tool.href}>
              <Card className="group h-full cursor-pointer border-border/40 bg-card/50 transition-colors hover:border-primary/30">
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
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
