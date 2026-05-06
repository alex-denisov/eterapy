import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";
import {
  Sparkles,
  MessageCircle,
  Moon,
  Hash,
  Star,
  BookOpen,
} from "lucide-react";

const MODALITIES = [
  { href: "/cabinet/modalities/checkin", icon: MessageCircle, label: "Диалог ясности", desc: "Короткий вопрос и бережное уточнение контекста" },
  { href: "/cabinet/modalities/checkin?source=legacy-tarot-cabinet-card", icon: Sparkles, label: "Таро как тема", desc: "Начните с вопроса, а не с отдельной платной развилки" },
  { href: "/cabinet/modalities/checkin?source=legacy-horoscope-cabinet-card", icon: Moon, label: "Гороскоп как тема", desc: "Мягкий вход в диалог и ежедневные карточки v5" },
  { href: "/cabinet/modalities/checkin?source=legacy-numerology-cabinet-card", icon: Hash, label: "Нумерология как тема", desc: "Контекст вопроса важнее прежнего отдельного расчета" },
  { href: "/cabinet/modalities/checkin?source=legacy-natal-cabinet-card", icon: Star, label: "Натальная карта как тема", desc: "Используйте дату и место рождения как часть вопроса" },
  { href: "/cabinet/modalities/checkin?source=legacy-guide-cabinet-card", icon: BookOpen, label: "Личный гид как тема", desc: "Персональный текст теперь рождается из единого диалога" },
];

export default function ClientModalitiesPage() {
  return (
    <PageContainer>
      <div className="mb-7">
        <div className="premium-eyebrow">Сценарии</div>
        <h1 className="premium-title mt-3 text-3xl md:text-4xl">Сценарии ясности</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Старые направления больше не открывают отдельные платные инструменты. Выберите тему,
          а ETerapy начнет с единого диалога и сохранит правильный контекст.
        </p>
      </div>

      {/* Горизонтальные табы-подуровни */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {MODALITIES.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="premium-chip shrink-0 hover:border-brand-soft-gold/35 hover:text-brand-soft-gold"
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODALITIES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}
              className="premium-card flex items-start gap-4 p-5 transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-brand-soft-gold/35 hover:bg-card/50">
              <Icon className="h-8 w-8 shrink-0 mt-0.5 text-primary" />
              <div>
                <p className="font-medium">{t.label}</p>
                <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed">{t.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </PageContainer>
  );
}
