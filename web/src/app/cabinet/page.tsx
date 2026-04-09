import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { BookingsList } from "@/components/bookings-list";

export default async function ClientCabinetPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user?.role ?? "CLIENT";
  if (role === "PRACTITIONER") redirect("/cabinet/practitioner");
  if (role === "ADMIN" || role === "SUPERADMIN") redirect("/admin");

  if (!session.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const [bookingCount, recentBookings] = await Promise.all([
    db.booking.count({ where: { clientId: userId } }),
    db.booking.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { practitioner: { include: { user: { select: { name: true } } } } },
    }),
  ]);

  const firstName = session.user?.name?.split(" ")[0] ?? "пользователь";

  // Прогресс-бар бесплатных сессий: 3 включено, сколько использовано
  const FREE_LIMIT = 3;
  const usedSessions = Math.min(bookingCount, FREE_LIMIT);
  const remainingSessions = Math.max(FREE_LIMIT - bookingCount, 0);
  const progressPct = Math.min((bookingCount / FREE_LIMIT) * 100, 100);

  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-bold mb-1">Привет, {firstName} 👋</h1>
      <p className="text-muted-foreground text-sm mb-8">{session.user?.email}</p>

      {/* Статистика */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {/* Бесплатные сессии — прогресс-бар */}
        <Card className="border-border/40 bg-card/50 sm:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-muted-foreground">Бесплатные сессии</p>
                <p className="mt-1 font-heading text-3xl font-bold text-primary tabular-nums">
                  {remainingSessions} из {FREE_LIMIT}
                </p>
              </div>
              <p className="text-sm text-muted-foreground text-right">
                Использовано: {usedSessions}
              </p>
            </div>
            <div className="h-3 w-full rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  progressPct >= 100 ? "bg-destructive" : progressPct >= 66 ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {remainingSessions > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Осталось {remainingSessions} бесплатн{remainingSessions === 1 ? "ая" : remainingSessions < 5 ? "ые" : "ых"} сесси{remainingSessions === 1 ? "я" : remainingSessions < 5 ? "и" : "й"} в этом месяце
              </p>
            ) : (
              <Link href="/cabinet/billing" className="mt-2 inline-block text-xs text-primary hover:underline">
                Купить дополнительные сессии →
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Баланс */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Баланс</p>
            <p className="mt-1 font-heading text-3xl font-bold tabular-nums">0 ₽</p>
            <Link href="/cabinet/billing" className="mt-1 block text-xs text-primary hover:underline">
              Пополнить →
            </Link>
          </CardContent>
        </Card>

        {/* Направления */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Направления</p>
            <p className="mt-1 font-heading text-3xl font-bold tabular-nums">6</p>
            <Link href="/cabinet/modalities" className="mt-1 block text-xs text-primary hover:underline">
              Открыть →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Последние записи */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Ближайшие записи</h2>
          <Link href="/cabinet/bookings" className="text-sm text-primary hover:underline">Все записи →</Link>
        </div>
        {recentBookings.length === 0 ? (
          <div className="rounded-xl border border-border/30 bg-card/20 p-6 text-center">
            <p className="text-muted-foreground text-sm">Нет предстоящих записей</p>
            <Link href="/cabinet/practitioners" className="mt-3 inline-block text-sm text-primary hover:underline">
              Найти практика →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-card/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{b.practitioner.user.name}</p>
                  <p className="text-xs text-muted-foreground">{b.priceRub.toLocaleString("ru")} ₽</p>
                </div>
                <span className={`text-xs ${b.status === "CONFIRMED" ? "text-green-400" : "text-yellow-400"}`}>
                  {b.status === "CONFIRMED" ? "Подтверждено" : "Ожидает"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Направления самопознания */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Направления</h2>
          <Link href="/cabinet/modalities" className="text-sm text-primary hover:underline">Все →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { href: "/modalities/tarot", icon: "🃏", label: "Расклад Таро", desc: "Расклад на три карты" },
            { href: "/modalities/checkin", icon: "💬", label: "Рефлексия", desc: "5 вопросов о состоянии" },
            { href: "/modalities/horoscope", icon: "🌙", label: "Гороскоп", desc: "Ежедневный / недельный" },
            { href: "/modalities/numerology", icon: "🔢", label: "Нумерология", desc: "Число жизненного пути" },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/30 p-4 transition-colors hover:border-primary/40 hover:bg-card/50">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
