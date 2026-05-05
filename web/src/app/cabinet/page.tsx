export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { adminUrl, appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

export default async function ClientCabinetPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  const role = session.user?.role ?? "CLIENT";
  if (role === "PRACTITIONER") redirect("/cabinet/practitioner");
  if (role === "ADMIN" || role === "SUPERADMIN") redirect(adminUrl("/admin"));

  if (!session.user?.id) {
    redirect(loginUrl());
  }
  const userId = session.user.id;

  const [bookingCount, recentBookings, userData] = await Promise.all([
    db.booking.count({ where: { clientId: userId } }),
    db.booking.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { practitioner: { include: { user: { select: { name: true } } } } },
    }),
    db.user.findUnique({ where: { id: userId }, select: { balance: true } }),
  ]);

  const balanceRub = Math.floor((userData?.balance ?? 0) / 100);

  const firstName = session.user?.name?.split(" ")[0] ?? "пользователь";

  const mapProgress = Math.min(bookingCount * 18 + 28, 100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">Кабинет клиента</p>
          <h1 className="premium-title mt-2 text-3xl md:text-5xl">Добрый вечер, {firstName}</h1>
          <p className="mt-2 text-muted-foreground text-sm">{session.user?.email}</p>
        </div>
        <Link href={mainUrl("/all-modalities/checkin")} className="soft-button soft-button-primary w-full sm:w-auto">
          Новый разбор
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-8">
        <section className="soft-card soft-form-panel lg:col-span-2" data-testid="client-map-preview">
          <p className="premium-eyebrow">Ваш прогресс</p>
          <h2 className="mt-3 font-heading text-3xl font-medium text-[var(--soft-bordeaux)]">
            Карта собирает повторяющиеся темы
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            После каждого разбора здесь появляются вопросы, инсайты, маршруты и бережные рекомендации.
          </p>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-[var(--soft-paper-edge)]">
            <div className="h-full rounded-full bg-[var(--soft-terracotta)] transition-all" style={{ width: `${mapProgress}%` }} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="soft-chip soft-chip-warm">{bookingCount} записей</span>
            <span className="soft-chip">диалоги</span>
            <span className="soft-chip">отчеты</span>
            <Link href={appUrl("/cabinet/action-history")} className="soft-chip">Открыть карту →</Link>
          </div>
        </section>

        <section className="soft-card soft-form-panel">
          <p className="premium-eyebrow">Баланс</p>
          <p className="mt-4 font-heading text-4xl font-medium tabular-nums text-[var(--soft-bordeaux)]">
            {balanceRub.toLocaleString("ru")} ₽
          </p>
          <Link href={appUrl("/cabinet/billing")} className="soft-button soft-button-ghost mt-5 w-full">
            Пополнить
          </Link>
        </section>
      </div>

      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Ближайшие записи</h2>
          <Link href={appUrl("/cabinet/bookings")} className="text-sm text-primary hover:underline">Все записи →</Link>
        </div>
        {recentBookings.length === 0 ? (
          <div className="soft-card p-6 text-center">
            <p className="text-muted-foreground text-sm">Нет предстоящих записей</p>
            <Link href={appUrl("/cabinet/practitioners")} className="mt-3 inline-block text-sm text-primary hover:underline">
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
          <Link href={appUrl("/cabinet/modalities")} className="text-sm text-primary hover:underline">Все →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { href: mainUrl("/all-modalities/checkin"), icon: "01", label: "Диалог ясности", desc: "Первичный ответ по вопросу" },
            { href: mainUrl("/products/deep-report"), icon: "02", label: "Глубокий отчет", desc: "Развернутое углубление" },
            { href: mainUrl("/products/seven-days"), icon: "03", label: "7 дней к ясности", desc: "Короткий маршрут на неделю" },
            { href: appUrl("/cabinet/action-history"), icon: "04", label: "Моя карта", desc: "Сохраненные выводы" },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className="soft-card flex items-center gap-3 p-4 transition-colors hover:border-[var(--soft-terracotta)]">
              <span className="font-heading text-2xl text-primary">{item.icon}</span>
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
