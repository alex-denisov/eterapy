import Link from "next/link";

const TOOLS = [
  { href: "/tools/tarot",      icon: "🃏", label: "Расклад Таро",     desc: "Расклад на три карты: прошлое, настоящее, будущее" },
  { href: "/tools/checkin",    icon: "💬", label: "Рефлексия",         desc: "5 вопросов о вашем состоянии прямо сейчас" },
  { href: "/tools/horoscope",  icon: "🌙", label: "Гороскоп",          desc: "Персонализированный прогноз на день / неделю / месяц" },
  { href: "/tools/numerology", icon: "🔢", label: "Нумерология",       desc: "Число жизненного пути по Пифагору" },
  { href: "/tools/natal",      icon: "⭐", label: "Натальная карта",   desc: "Описание вашей карты по дате и месту рождения" },
  { href: "/tools/guide",      icon: "📖", label: "Личный гид",        desc: "Персональный текст на тему вашего запроса" },
];

export default function ClientToolsPage() {
  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-2">Инструменты самопознания</h1>
      <p className="text-sm text-muted-foreground mb-8">
        3 сессии в месяц включены в бесплатный план. Результаты носят ознакомительный характер.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href}
            className="flex items-start gap-4 rounded-xl border border-border/40 bg-card/30 p-5 transition-colors hover:border-primary/40 hover:bg-card/50">
            <span className="text-3xl shrink-0 mt-0.5">{t.icon}</span>
            <div>
              <p className="font-medium">{t.label}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
