import { Card, CardContent } from "@/components/ui/card";
import { ApplyForm } from "./apply-form";

export const metadata = {
  title: "Стать практиком — ETerapy",
  description: "Присоединяйтесь к платформе ETerapy как таролог, астролог или нумеролог. Готовая аудитория, удобное расписание, прозрачная оплата.",
};

const BENEFITS = [
  { icon: "🔮", title: "Готовая аудитория", desc: "Клиенты, уже заинтересованные в эзотерической практике — без рекламы и поиска" },
  { icon: "📅", title: "Удобное расписание", desc: "Сами управляете слотами, рабочими часами и доступностью через личный кабинет" },
  { icon: "💰", title: "Прозрачная оплата", desc: "Фиксированная комиссия платформы 15%. Остальное — ваше. Выплаты по запросу" },
  { icon: "⭐", title: "Рейтинг и рост", desc: "Реальные отзывы от верифицированных клиентов. Высокий рейтинг — выше в каталоге" },
  { icon: "🎥", title: "Видеочат в браузере", desc: "Все сессии проходят в защищённом видеочате. Ничего устанавливать не нужно" },
  { icon: "🤝", title: "Поддержка команды", desc: "Помогаем с профилем, отвечаем на вопросы, решаем спорные ситуации" },
];

const STEPS = [
  { n: "01", title: "Заполните форму", desc: "Расскажите о специализации, опыте и подходе к работе" },
  { n: "02", title: "Короткое знакомство", desc: "Связываемся в течение 1–2 дней для знакомства и проверки" },
  { n: "03", title: "Создание профиля", desc: "Администратор настраивает ваш профиль в каталоге и тарифы" },
  { n: "04", title: "Первые клиенты", desc: "Профиль виден всем пользователям, сессии начинаются" },
];

export default function PractitionerApplyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
          🔮 Для практиков
        </div>
        <h1 className="font-heading text-4xl font-bold mb-4">Станьте практиком ETerapy</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
          Платформа для тарологов, астрологов, нумерологов и других эзотерических практиков.
          Профессиональный инструмент для работы с клиентами онлайн.
        </p>
      </div>

      {/* Преимущества */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-16">
        {BENEFITS.map(b => (
          <div key={b.title} className="rounded-xl border border-border/30 bg-card/20 p-5">
            <div className="text-2xl mb-3">{b.icon}</div>
            <p className="font-semibold mb-1">{b.title}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
          </div>
        ))}
      </div>

      {/* Шаги */}
      <div className="mb-16">
        <h2 className="font-heading text-2xl font-bold text-center mb-8">Как попасть на платформу</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {STEPS.map(s => (
            <div key={s.n} className="flex gap-4 items-start rounded-xl border border-border/20 bg-card/10 p-5">
              <span className="font-heading text-3xl font-bold text-primary/25 shrink-0">{s.n}</span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Форма */}
      <div id="apply-form">
        <h2 className="font-heading text-2xl font-bold text-center mb-2">Заявка на участие</h2>
        <p className="text-center text-muted-foreground mb-8">
          Заполните форму — ответим в течение 1–2 рабочих дней
        </p>
        <ApplyForm />
      </div>

      {/* Юридическая заметка */}
      <p className="mt-8 text-center text-xs text-muted-foreground/50">
        Регистрация практика возможна только после проверки заявки администратором.
        Самостоятельная регистрация через стандартную форму не дает статус практика.
      </p>
    </div>
  );
}
