import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { SignOutButton } from "./signout-button";
import { BookingsList } from "@/components/bookings-list";

// Моковые данные истории
const mockHistory = [
  {
    id: "1",
    type: "tarot" as const,
    title: "Расклад Таро",
    date: "2026-04-02",
    summary: "Три карты: Император, Луна, Звезда",
  },
  {
    id: "2",
    type: "checkin" as const,
    title: "Рефлексия",
    date: "2026-04-01",
    summary: "5 вопросов пройдено",
  },
  {
    id: "3",
    type: "numerology" as const,
    title: "Нумерология",
    date: "2026-03-28",
    summary: "Число жизненного пути: 7",
  },
];

const toolIcons: Record<string, string> = {
  tarot: "🃏",
  checkin: "💬",
  numerology: "🔢",
  astrology: "⭐",
  horoscope: "🌙",
  guide: "📖",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const sessionsUsed = mockHistory.length;
  const sessionsTotal = 3;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Шапка */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">
            Привет, {session.user?.name?.split(" ")[0] ?? "пользователь"} 👋
          </h1>
          <p className="mt-1 text-muted-foreground">{session.user?.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/settings"
            className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            ⚙️ Настройки
          </Link>
          <SignOutButton />
        </div>
      </div>

      {/* Статистика */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Сессий использовано</p>
            <p className="mt-1 font-heading text-3xl font-bold text-primary">
              {sessionsUsed}
              <span className="text-lg text-muted-foreground">/{sessionsTotal}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">в этом месяце</p>
            {/* Прогресс-бар */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(sessionsUsed / sessionsTotal) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Сессий с практиками</p>
            <p className="mt-1 font-heading text-3xl font-bold">0</p>
            <p className="mt-1 text-xs text-muted-foreground">всего</p>
            <Link
              href="/practitioners"
              className="mt-2 block text-xs text-primary hover:underline"
            >
              Найти практика →
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Аккаунт</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">Активен</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Зарегистрирован сегодня
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Быстрые действия */}
      <div className="mb-8">
        <h2 className="mb-4 font-heading text-lg font-semibold">Быстрые действия</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {[
            { href: "/tools/tarot", icon: "🃏", label: "Расклад Таро" },
            { href: "/tools/checkin", icon: "💬", label: "Рефлексия" },
            { href: "/tools/horoscope", icon: "🌙", label: "Гороскоп" },
            { href: "/tools/numerology", icon: "🔢", label: "Нумерология" },
            { href: "/tools/natal", icon: "⭐", label: "Натальная карта" },
            { href: "/practitioners", icon: "👤", label: "Найти практика" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/30 p-4 transition-colors hover:border-primary/40 hover:bg-card/50"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Записи к практикам */}
      <div className="mb-8">
        <h2 className="mb-4 font-heading text-lg font-semibold">Записи к практикам</h2>
        <BookingsList role="client" />
      </div>

      {/* История инструментов */}
      <div>
        <h2 className="mb-4 font-heading text-lg font-semibold">
          История инструментов
        </h2>
        {mockHistory.length === 0 ? (
          <div className="rounded-xl border border-border/30 py-12 text-center text-muted-foreground">
            Пока нет истории. Попробуйте инструменты самопознания.
          </div>
        ) : (
          <div className="space-y-3">
            {mockHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-xl border border-border/30 bg-card/30 p-4"
              >
                <span className="text-2xl">{toolIcons[item.type] ?? "✦"}</span>
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.summary}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.date).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
