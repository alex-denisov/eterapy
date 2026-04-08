import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { BookingsList } from "@/components/bookings-list";

export default async function ClientCabinetPage() {
  const session = await auth();
  if (!session) redirect("/login");
  // @ts-expect-error custom field
  const role = session.user?.role ?? "CLIENT";
  if (role === "PRACTITIONER") redirect("/cabinet/practitioner");
  if (role === "ADMIN" || role === "SUPERADMIN") redirect("/admin");

  if (!session.user?.id) {
    throw new Error("User ID is required");
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

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-1">Привет, {firstName} 👋</h1>
      <p className="text-muted-foreground text-sm mb-8">{session.user?.email}</p>

      {/* Статистика */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Сессий с практиками</p>
            <p className="mt-1 font-heading text-3xl font-bold text-primary">{bookingCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">всего</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Инструментов</p>
            <p className="mt-1 font-heading text-3xl font-bold">6</p>
            <Link href="/cabinet/tools" className="mt-1 block text-xs text-primary hover:underline">Открыть →</Link>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Баланс</p>
            <p className="mt-1 font-heading text-3xl font-bold">0 ₽</p>
            <Link href="/cabinet/billing" className="mt-1 block text-xs text-primary hover:underline">Пополнить →</Link>
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
            <Link href="/practitioners" className="mt-3 inline-block text-sm text-primary hover:underline">
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

      {/* Инструменты самопознания */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Инструменты</h2>
          <Link href="/cabinet/tools" className="text-sm text-primary hover:underline">Все →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { href: "/tools/tarot", icon: "🃏", label: "Расклад Таро", desc: "Расклад на три карты" },
            { href: "/tools/checkin", icon: "💬", label: "Рефлексия", desc: "5 вопросов о состоянии" },
            { href: "/tools/horoscope", icon: "🌙", label: "Гороскоп", desc: "Ежедневный / недельный" },
            { href: "/tools/numerology", icon: "🔢", label: "Нумерология", desc: "Число жизненного пути" },
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
    </div>
  );
}
