import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "../signout-button";
import { BookingsList } from "@/components/bookings-list";
import { SlotManager } from "./slot-manager";

// Мок данных практика
const mockPractitioner = {
  name: "Елена Морозова",
  status: "active" as const,
  rating: 4.9,
  reviewCount: 147,
  sessionCount: 312,
  pricePerSession: 2500,
  balance: 18750,
  nextPayout: "2026-04-10",
  upcomingSessions: [
    { id: "1", client: "Анна К.", date: "Сегодня 18:00", status: "confirmed" },
    { id: "2", client: "Дмитрий П.", date: "Завтра 11:00", status: "confirmed" },
    { id: "3", client: "Мария С.", date: "5 апр. 15:00", status: "pending" },
  ],
  recentReviews: [
    { author: "Анна К.", rating: 5, text: "Очень точный расклад!", date: "2026-04-02" },
    { author: "Иван Р.", rating: 5, text: "Профессионально, без давления.", date: "2026-04-01" },
  ],
};

const STATUS_LABELS = {
  active: { label: "Активен", color: "bg-green-500/10 text-green-400" },
  pending: { label: "На проверке", color: "bg-yellow-500/10 text-yellow-400" },
  suspended: { label: "Приостановлен", color: "bg-destructive/10 text-destructive" },
};

export default async function PractitionerDashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const p = mockPractitioner;
  const st = STATUS_LABELS[p.status];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Шапка */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">{p.name}</h1>
            <Badge className={st.color}>{st.label}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">Кабинет практика</p>
        </div>
        <div className="flex gap-2">
          <Link href="/practitioners/elena-morozova"
            className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Мой профиль →
          </Link>
          <SignOutButton />
        </div>
      </div>

      {/* Статистика */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Рейтинг", value: p.rating.toFixed(1), sub: `${p.reviewCount} отзывов`, icon: "★" },
          { label: "Сессий всего", value: p.sessionCount, sub: "за всё время", icon: "📅" },
          { label: "На балансе", value: `${p.balance.toLocaleString("ru")} ₽`, sub: `Выплата ${p.nextPayout}`, icon: "💰" },
          { label: "Цена сессии", value: `${p.pricePerSession.toLocaleString("ru")} ₽`, sub: "редактировать →", icon: "⚙️" },
        ].map((s) => (
          <Card key={s.label} className="border-border/40 bg-card/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <span className="text-xl">{s.icon}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-primary">{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Запросы на сессии */}
        <div>
          <h2 className="mb-4 font-heading text-lg font-semibold">Запросы на сессии</h2>
          <BookingsList role="practitioner" />
        </div>

        {/* Последние отзывы */}
        <div>
          <h2 className="mb-4 font-heading text-lg font-semibold">Последние отзывы</h2>
          <div className="space-y-3">
            {p.recentReviews.map((r, i) => (
              <Card key={i} className="border-border/30 bg-card/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.author}</span>
                    <span className="text-primary">{"★".repeat(r.rating)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Управление профилем */}
      <div className="mt-8">
        <h2 className="mb-4 font-heading text-lg font-semibold">Управление профилем</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: "📅", label: "Расписание", desc: "Управление слотами", href: "#" },
            { icon: "💳", label: "Выплаты", desc: "Реквизиты и история", href: "#" },
            { icon: "⚙️", label: "Настройки", desc: "Профиль и цена", href: "#" },
          ].map((item) => (
            <Link key={item.label} href={item.href}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/30 p-4 transition-colors hover:border-primary/40">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Управление слотами */}
      <div className="mt-8">
        <h2 className="mb-4 font-heading text-lg font-semibold">Расписание</h2>
        <SlotManager practitionerId="test-practitioner-001" />
      </div>

      {/* Навигация между кабинетами */}
      <div className="mt-6 flex justify-center">
        <Link href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Кабинет клиента
        </Link>
      </div>
    </div>
  );
}
