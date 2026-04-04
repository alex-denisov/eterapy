import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const HOW_IT_WORKS = [
  { step: "01", title: "Оставьте заявку", desc: "Напишите нам — расскажите о своей практике, опыте и специализации." },
  { step: "02", title: "Проверка и разговор", desc: "Мы изучим вашу заявку и свяжемся для короткого знакомства." },
  { step: "03", title: "Создание профиля", desc: "Администратор поможет настроить ваш профиль и расписание в каталоге." },
  { step: "04", title: "Первые клиенты", desc: "После проверки ваш профиль становится виден в каталоге ETerapy." },
];

const BENEFITS = [
  { icon: "🔮", title: "Готовая аудитория", desc: "Клиенты, уже заинтересованные в эзотерической практике" },
  { icon: "📅", title: "Удобное расписание", desc: "Сами управляете слотами и доступностью" },
  { icon: "💰", title: "Прозрачная оплата", desc: "Выплаты через ЮKassa/Stripe, комиссия 15%" },
  { icon: "⭐", title: "Рейтинг и отзывы", desc: "Система рейтинга помогает расти в каталоге" },
];

export default function PractitionerApplyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <span className="text-5xl mb-4 block">🔮</span>
        <h1 className="font-heading text-4xl font-bold mb-4">Станьте практиком ETerapy</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Мы объединяем опытных практиков эзотерики с людьми, которые ищут поддержку и самопознание.
          Присоединяйтесь к сообществу практиков.
        </p>
      </div>

      {/* Преимущества */}
      <div className="grid gap-4 sm:grid-cols-2 mb-16">
        {BENEFITS.map((b) => (
          <Card key={b.title} className="border-border/40 bg-card/30">
            <CardContent className="p-6 flex gap-4">
              <span className="text-3xl shrink-0">{b.icon}</span>
              <div>
                <p className="font-semibold">{b.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{b.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Как это работает */}
      <div className="mb-16">
        <h2 className="font-heading text-2xl font-bold text-center mb-8">Как попасть на платформу</h2>
        <div className="space-y-4">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.step} className="flex gap-5 items-start">
              <span className="font-heading text-3xl font-bold text-primary/30 shrink-0 w-10">{s.step}</span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
        <h2 className="font-heading text-2xl font-bold mb-3">Готовы начать?</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Напишите нам — расскажите о своей специализации, опыте и почему вы хотите присоединиться.
          Мы ответим в течение 1–2 рабочих дней.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="mailto:practitioners@eterapy.com?subject=Заявка практика&body=Расскажите о своей специализации и опыте..."
            className={cn(buttonVariants(), "inline-flex items-center gap-2")}>
            ✉️ Написать заявку
          </a>
          <a href="https://t.me/eterapy_support" target="_blank" rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "border-border/40 text-muted-foreground inline-flex items-center gap-2")}>
            💬 Написать в Telegram
          </a>
        </div>

        <p className="mt-6 text-xs text-muted-foreground/60">
          practitioners@eterapy.com · Регистрация только через администратора — самостоятельная регистрация как практик недоступна
        </p>
      </div>

      <div className="mt-8 text-center">
        <Link href="/practitioners" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Посмотреть каталог практиков
        </Link>
      </div>
    </div>
  );
}
