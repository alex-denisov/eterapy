export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

async function getPractitionerData(userId: string) {
  return db.practitioner.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, email: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 3 },
      slots: {
        where: { available: true, startAt: { gte: new Date() } },
        orderBy: { startAt: "asc" },
        take: 5,
      },
    },
  });
}

const STATUS_LABELS = {
  ACTIVE:    { label: "Активен",       bg: "rgba(155,174,148,.22)", color: "#3a4a36" },
  PENDING:   { label: "На проверке",   bg: "rgba(244,217,193,.8)", color: "var(--soft-bordeaux)" },
  SUSPENDED: { label: "Приостановлен", bg: "rgba(220,60,60,.08)",   color: "#b02020" },
  BLOCKED:   { label: "Заблокирован",  bg: "rgba(220,60,60,.15)",   color: "#b02020" },
};

export default async function PractitionerCabinetPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await getPractitionerData(session.user!.id!);
  if (!practitioner) {
    return (
      <div className="px-6 py-8 text-center">
        <h1 className="font-heading text-xl font-bold">Профиль практика не настроен</h1>
        <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">Обратитесь в поддержку: support@eterapy.com</p>
      </div>
    );
  }

  const rating = practitioner.reviewCount > 0 ? (practitioner.ratingSum / practitioner.reviewCount).toFixed(1) : "—";
  const st = STATUS_LABELS[practitioner.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.ACTIVE;
  const firstName = practitioner.user.name?.split(" ")[0] ?? "Специалист";

  // Pending bookings
  const pendingBookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: "PENDING" },
    include: { client: { select: { name: true, email: true } }, slot: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Confirmed / upcoming sessions
  const upcomingBookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
    include: { client: { select: { name: true, email: true } }, slot: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  return (
    <div className="max-w-6xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }}>
      {/* v4 header: eyebrow "сводка" + h1 + action buttons */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="soft-eyebrow">сводка</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="soft-h1">
              Здравствуйте, <span className="soft-italic">{firstName}</span>
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "3px 12px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                background: st.bg,
                color: st.color,
              }}
            >
              {st.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">{practitioner.title}</p>
        </div>
        <div className="flex gap-2">
          <Link href={appUrl("/cabinet/practitioner/schedule")} className="soft-button soft-button-ghost">
            Открыть расписание
          </Link>
          <Link href={appUrl("/cabinet/practitioner/services")} className="soft-button soft-button-primary">
            Добавить услугу
          </Link>
        </div>
      </div>

      {/* v4 4-col stat grid — first card with gradient */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className="soft-card p-5"
          style={{ background: "linear-gradient(140deg, #E8C4B8, #F4D5C8)" }}
        >
          <p className="soft-eyebrow">заявок на неделю</p>
          <p
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontSize: 32,
              color: "var(--soft-bordeaux)",
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            {pendingBookings.length}
          </p>
          <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">ожидают подтверждения</p>
        </div>

        <div className="soft-card p-5">
          <p className="soft-eyebrow">встреч проведено</p>
          <p
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontSize: 32,
              color: "var(--soft-bordeaux)",
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            {practitioner.sessionCount}
          </p>
          <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">за всё время</p>
        </div>

        <div className="soft-card p-5">
          <p className="soft-eyebrow">рейтинг</p>
          <p
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontSize: 32,
              color: "var(--soft-bordeaux)",
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            {rating}
          </p>
          <Link
            href={appUrl("/cabinet/practitioner/reviews")}
            className="mt-1 block text-xs text-[var(--soft-terracotta-dark)]"
          >
            {practitioner.reviewCount} отзывов →
          </Link>
        </div>

        <div
          className="soft-card p-5"
          style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}
        >
          <p className="soft-eyebrow">к выплате</p>
          <p
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontSize: 32,
              color: "var(--soft-bordeaux)",
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            0 ₽
          </p>
          <Link
            href={appUrl("/cabinet/practitioner/earnings")}
            className="mt-1 block text-xs text-[var(--soft-terracotta-dark)]"
          >
            выплата в разработке →
          </Link>
        </div>
      </div>

      {/* v4: schedule + requests side-by-side (1.4fr / 1fr) */}
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] mb-4">
        {/* Расписание / подтверждённые сессии */}
        <div className="soft-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="soft-eyebrow">расписание · ближайшее</p>
            <Link href={appUrl("/cabinet/practitioner/schedule")} className="soft-chip text-xs">
              Все слоты →
            </Link>
          </div>
          {upcomingBookings.length === 0 ? (
            <p className="text-sm text-[var(--soft-ink-faint)]">Нет подтверждённых сессий</p>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingBookings.map((b) => {
                const clientName = b.client.name ?? b.client.email ?? "Клиент";
                const timeStr = b.slot
                  ? new Date(b.slot.startAt).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                  : "Время не указано";
                const durationMin = b.slot
                  ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
                  : 50;
                const isPending = b.status === "PENDING";
                return (
                  <div
                    key={b.id}
                    className="flex items-center justify-between"
                    style={{ padding: "12px 14px", background: "var(--soft-paper-deep)", borderRadius: 12 }}
                  >
                    <div className="flex items-start gap-4">
                      <span
                        style={{
                          fontFamily: "var(--font-heading, serif)",
                          color: "var(--soft-bordeaux)",
                          fontWeight: 500,
                          fontSize: 13,
                          width: 130,
                        }}
                      >
                        {timeStr}
                      </span>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: 14 }}>{clientName}</p>
                        <p className="text-xs text-[var(--soft-ink-faint)]">Индивидуальная · {durationMin} мин</p>
                      </div>
                    </div>
                    <span
                      className="soft-badge"
                      style={{
                        fontSize: 11,
                        background: isPending ? "var(--soft-rose)" : "var(--soft-sage, #d6decc)",
                        color: "var(--soft-bordeaux)",
                      }}
                    >
                      {isPending ? "ждёт согласования" : "подтверждено"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Новые заявки */}
        <div className="soft-card p-5">
          <p className="soft-eyebrow mb-4">новые заявки</p>
          {pendingBookings.length === 0 ? (
            <p className="text-sm text-[var(--soft-ink-faint)]">Нет новых запросов</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingBookings.slice(0, 3).map((b) => {
                const clientName = b.client.name ?? b.client.email ?? "Клиент";
                return (
                  <div key={b.id} className="soft-card-flat p-3.5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {clientName[0]}. {clientName.split(" ")[1]?.[0] ? `${clientName.split(" ")[1][0]}.` : ""}
                      </span>
                      <span className="soft-badge soft-badge-lilac" style={{ fontSize: 10 }}>новая</span>
                    </div>
                    <p className="text-xs text-[var(--soft-ink-soft)] leading-relaxed mb-2">
                      {b.slot
                        ? new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "Время не указано"}{" "}
                      · {b.priceRub.toLocaleString("ru")} ₽
                    </p>
                    <div className="flex gap-2">
                      <PendingActions bookingId={b.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* v4: lilac gradient "новый формат" banner */}
      <div className="soft-card p-5" style={{ background: "linear-gradient(140deg, #DBD3EA, #E8E1F2)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div style={{ maxWidth: 520 }}>
            <p className="soft-eyebrow">новый формат</p>
            <h3 className="soft-h3 mt-2">Совместные сессии: эзотерик + психотерапевт</h3>
            <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
              Запускаем парные встречи. Если интересно работать в паре с астрологом или таро-практиком — заполните короткую форму.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link href={appUrl("/cabinet/practitioner/profile")} className="soft-button soft-button-primary">
              Заполнить интерес
            </Link>
            <Link href={mainUrl("/how-it-works")} className="soft-chip text-sm">
              Узнать подробнее
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingActions({ bookingId: _bookingId }: { bookingId: string }) {
  void _bookingId;
  return (
    <span className="soft-chip text-xs" style={{ color: "var(--soft-ink-faint)" }}>Ожидает</span>
  );
}
