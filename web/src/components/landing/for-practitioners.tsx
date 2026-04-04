import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const benefits = [
  {
    icon: "💰",
    title: "Комиссия 25% — прозрачно",
    description: "Для первых 50 практиков — 15% на 6 месяцев. Работайте параллельно где угодно.",
  },
  {
    icon: "🌍",
    title: "Международные платежи",
    description: "Принимайте оплату из Европы и США через Stripe. Единственная РФ-платформа с этой возможностью.",
  },
  {
    icon: "📋",
    title: "Легальные выплаты",
    description: "Агентский договор, автоматические чеки. Больше никаких рисков блокировки счёта.",
  },
  {
    icon: "🤖",
    title: "Умный ассистент",
    description: "Черновик отчёта по сессии, структура консультации, натальная карта клиента — автоматически.",
  },
  {
    icon: "📊",
    title: "Кабинет с аналитикой",
    description: "Расписание, история сессий, статус выплат, рейтинг — всё в одном месте.",
  },
  {
    icon: "✅",
    title: "Значок верификации",
    description: "«Проверен ETerapy» — для вашего Telegram-канала. Повышает доверие подписчиков.",
  },
];

export function ForPractitionersSection() {
  return (
    <section id="for-practitioners" className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-center text-3xl font-bold md:text-4xl">
          Для практиков
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Инфраструктура международного уровня с честными условиями
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div key={b.title} className="flex gap-4">
              <span className="mt-0.5 text-2xl">{b.icon}</span>
              <div>
                <h3 className="font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {b.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/practitioners/apply"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-primary/30 text-primary hover:bg-primary/10")}
          >
            Стать практиком →
          </Link>
        </div>
      </div>
    </section>
  );
}
