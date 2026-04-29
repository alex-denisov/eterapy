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
  { href: "/cabinet/modalities/tarot",      icon: Sparkles,   label: "Расклад Таро",     desc: "Расклад на три карты: прошлое, настоящее, будущее" },
  { href: "/cabinet/modalities/checkin",    icon: MessageCircle, label: "Диалог ясности", desc: "Короткий вопрос и бережное уточнение контекста" },
  { href: "/cabinet/modalities/horoscope",  icon: Moon,       label: "Гороскоп",          desc: "Персонализированный прогноз на день / неделю / месяц" },
  { href: "/cabinet/modalities/numerology", icon: Hash,       label: "Нумерология",       desc: "Число жизненного пути по Пифагору" },
  { href: "/cabinet/modalities/natal",      icon: Star,       label: "Натальная карта",   desc: "Описание вашей карты по дате и месту рождения" },
  { href: "/cabinet/modalities/guide",      icon: BookOpen,   label: "Личный гид",        desc: "Персональный текст на тему вашего запроса" },
];

export default function ClientModalitiesPage() {
  return (
    <PageContainer>
      <div className="mb-7">
        <div className="premium-eyebrow">Сценарии</div>
        <h1 className="premium-title mt-3 text-3xl md:text-4xl">Направления самопознания</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          3 сессии в месяц включены в бесплатный план. Результаты носят ознакомительный характер.
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
