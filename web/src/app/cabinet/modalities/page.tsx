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
  { href: "/modalities/tarot",      icon: Sparkles,   label: "Расклад Таро",     desc: "Расклад на три карты: прошлое, настоящее, будущее" },
  { href: "/modalities/checkin",    icon: MessageCircle, label: "Рефлексия",     desc: "5 вопросов о вашем состоянии прямо сейчас" },
  { href: "/modalities/horoscope",  icon: Moon,       label: "Гороскоп",          desc: "Персонализированный прогноз на день / неделю / месяц" },
  { href: "/modalities/numerology", icon: Hash,       label: "Нумерология",       desc: "Число жизненного пути по Пифагору" },
  { href: "/modalities/natal",      icon: Star,       label: "Натальная карта",   desc: "Описание вашей карты по дате и месту рождения" },
  { href: "/modalities/guide",      icon: BookOpen,   label: "Личный гид",        desc: "Персональный текст на тему вашего запроса" },
];

export default function ClientModalitiesPage() {
  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-bold mb-2">Направления самопознания</h1>
      <p className="text-sm text-muted-foreground mb-8">
        3 сессии в месяц включены в бесплатный план. Результаты носят ознакомительный характер.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {MODALITIES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}
              className="flex items-start gap-4 rounded-xl border border-border/40 bg-card/30 p-5 transition-colors hover:border-primary/40 hover:bg-card/50">
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
