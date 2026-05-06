import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";
import {
  MessageCircle,
  FileText,
  MessagesSquare,
  HeartHandshake,
  CalendarDays,
  BookOpen,
  Map,
} from "lucide-react";
import { appUrl, mainUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

const MODALITIES = [
  { href: appUrl("/cabinet/modalities/checkin"), icon: MessageCircle, label: "Диалог ясности", desc: "Короткий вопрос, бережные уточнения и первичный ответ без оплаты", tone: "warm" },
  { href: mainUrl("/products/deep-report"), icon: FileText, label: "Глубокий отчет", desc: "Структурированный разбор с рекомендациями, когда первичного ответа мало", tone: "paper" },
  { href: mainUrl("/products/perspectives"), icon: BookOpen, label: "4 ракурса ответа", desc: "Несколько точек зрения на один вопрос без обещаний и давления", tone: "paper" },
  { href: mainUrl("/products/chat-analysis"), icon: MessagesSquare, label: "Разбор переписки", desc: "Приватный анализ текста с возможностью удалить источник", tone: "paper" },
  { href: mainUrl("/products/compatibility"), icon: HeartHandshake, label: "Совместимость", desc: "Парный сценарий только после согласия второго участника", tone: "paper" },
  { href: mainUrl("/products/seven-days"), icon: CalendarDays, label: "7 дней к ясности", desc: "Мягкий маршрут с ежедневными шагами и финальным отчетом", tone: "paper" },
];

export default function ClientModalitiesPage() {
  return (
    <PageContainer>
      <section className="soft-card soft-hero-side-card p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="soft-eyebrow">Сценарии</div>
            <h1 className="soft-h1 mt-3">Сценарии ясности</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--soft-ink-soft)]">
              Все сценарии начинаются с контекста вашего вопроса. Старые отдельные инструменты
              заменены единым v5-потоком: сначала бесплатное прояснение, затем углубление или
              специалист только если это действительно уместно.
            </p>
          </div>
          <div className="rounded-[28px] border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.48)] p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-[rgba(92,42,44,0.08)] text-[var(--soft-bordeaux)]">
                <Map className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-[var(--soft-ink)]">Один маршрут вместо каталога</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  Вы выбираете не “инструмент”, а следующий бережный шаг.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-7 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {MODALITIES.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="soft-chip shrink-0"
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {MODALITIES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}
              className={cn(
                "soft-card flex items-start gap-4 p-5 transition-[border-color,transform] hover:-translate-y-0.5",
                t.tone === "warm" ? "border-[rgba(92,42,44,0.2)] bg-[rgba(255,255,255,0.64)]" : "bg-[rgba(255,255,255,0.5)]",
              )}>
              <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgba(214,117,88,0.1)] text-[var(--soft-terracotta-dark)]">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-[var(--soft-ink)]">{t.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{t.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </PageContainer>
  );
}
