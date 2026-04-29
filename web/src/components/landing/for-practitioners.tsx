import Link from "next/link";
import { BadgeCheck, BarChart3, BrainCircuit, FileCheck2, Globe2, WalletCards } from "lucide-react";
import { PremiumCard, PremiumSection } from "@/components/v5/premium";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const benefits = [
  {
    icon: WalletCards,
    title: "Комиссия 25% — прозрачно",
    description: "Для первых 50 практиков — 15% на 6 месяцев. Работайте параллельно где угодно.",
  },
  {
    icon: Globe2,
    title: "Международные платежи",
    description: "Принимайте онлайн-оплату за сессии — безопасно и прозрачно.",
  },
  {
    icon: FileCheck2,
    title: "Легальные выплаты",
    description: "Агентский договор, автоматические чеки. Больше никаких рисков блокировки счёта.",
  },
  {
    icon: BrainCircuit,
    title: "Умный ассистент",
    description: "Черновик отчёта по сессии, структура консультации, натальная карта клиента — автоматически.",
  },
  {
    icon: BarChart3,
    title: "Кабинет с аналитикой",
    description: "Расписание, история сессий, статус выплат, рейтинг — всё в одном месте.",
  },
  {
    icon: BadgeCheck,
    title: "Значок верификации",
    description: "«Проверен ETerapy» — для вашего Telegram-канала. Повышает доверие подписчиков.",
  },
];

export function ForPractitionersSection() {
  return (
    <PremiumSection
      id="for-practitioners"
      className="px-4"
      eyebrow="Для практиков"
      title={<>Инфраструктура с <span className="text-brand-soft-gold">честными условиями</span></>}
      lead="Кабинет, расписание, выплаты, Pro-инструменты и прозрачная верификация."
    >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <PremiumCard key={b.title} className="flex gap-4">
              <b.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-heading text-xl font-medium">{b.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {b.description}
                </p>
              </div>
            </PremiumCard>
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
    </PremiumSection>
  );
}
