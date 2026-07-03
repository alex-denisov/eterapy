"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ReviewModal } from "@/components/review-modal";
import { appUrl } from "@/lib/subdomain";
import { ComplaintModal } from "@/components/complaint-modal";
import { getBookingStatus } from "@/lib/booking-status";
import { canJoinBooking, canCancelBooking, bookingDurationMin } from "@/lib/booking-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Booking {
  id: string;
  status: string;
  priceRub: number;
  createdAt: string;
  slot: { startAt: string; endAt: string } | null;
  sessionUrl: string | null;
  practitioner?: { name: string; id: string };
  review?: { id: string } | null;
}

type FilterTab = "upcoming" | "past" | "cancelled" | "all";

const PAGE_SIZE = 4;

function isCancelled(b: Booking): boolean {
  return ["CANCELLED", "EXPIRED"].includes(b.status);
}

function isUpcoming(b: Booking): boolean {
  if (!["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status)) return false;
  if (b.slot?.startAt) return new Date(b.slot.startAt) > new Date();
  return true;
}

// «Прошедшие» = attended/lapsed but not cancelled.
function isPastDone(b: Booking): boolean {
  if (isCancelled(b)) return false;
  if (b.status === "COMPLETED") return true;
  if (["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot?.startAt) {
    return new Date(b.slot.startAt) <= new Date();
  }
  return false;
}

function slotDateTime(startAt: string | null | undefined): string {
  if (!startAt) return "Время уточняется";
  const d = new Date(startAt);
  if (isNaN(d.getTime())) return "Время уточняется";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function rowMeta(b: Booking): string {
  const parts: string[] = [];
  const dur = bookingDurationMin(b);
  if (dur) parts.push(`${dur} мин`);
  parts.push(slotDateTime(b.slot?.startAt));
  parts.push(`${b.priceRub.toLocaleString("ru")} ₽`);
  return parts.join(" · ");
}

// «живой разговор» invite (round-3 #6 / round-4 #14): the copy adapts to the
// history — «продолжить работу» once the client has met a specialist, a warmer
// first-invite otherwise. Replaces the dead «Здесь пока пусто» on «Предстоящие».
function InviteBlock({ hasPast, className = "" }: { hasPast: boolean; className?: string }) {
  return (
    <section className={`soft-card p-5 text-center ${className}`} data-testid="bookings-invite">
      <p className="soft-h3" style={{ color: "var(--soft-bordeaux)" }}>
        {hasPast ? "Хотите продолжить работу со специалистом?" : "Иногда живой разговор помогает больше всего"}
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
        {hasPast
          ? "Регулярные встречи помогают удержать найденное и двигаться дальше в своём темпе."
          : "Выберите специалиста и удобное время — спокойно, без обязательств."}
      </p>
      <Link href={appUrl("/practitioners")} className="soft-button soft-button-primary mt-4 inline-flex">
        Выбрать специалиста
      </Link>
    </section>
  );
}

// «Войти в сессию» rail, shown only inside the 30-мин join window.
function JoinRail({ b }: { b: Booking }) {
  if (!canJoinBooking(b)) return null;
  const live = b.status === "IN_PROGRESS";
  return (
    <div className="mt-3 flex items-center justify-between rounded-xl p-3"
      style={{ background: live ? "rgba(168, 155, 201, 0.15)" : "rgba(155, 174, 148, 0.15)", border: `1px solid ${live ? "rgba(168, 155, 201, 0.3)" : "rgba(155, 174, 148, 0.3)"}` }}>
      <div className="flex items-center gap-2">
        {live && <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--soft-terracotta)" }} />}
        <p className="text-xs" style={{ color: live ? "var(--soft-lilac)" : "var(--soft-sage)" }}>{live ? "Сессия идёт" : "Сессия скоро начнётся"}</p>
      </div>
      <a href={b.sessionUrl ?? `/session/${b.id}`} className="soft-button soft-button-primary"
        style={{ minHeight: "2rem", padding: "0.4rem 1rem", fontSize: "0.8rem" }}>
        {live ? "Подключиться" : "Войти в сессию"}
      </a>
    </div>
  );
}

export default function ClientBookingsPage() {
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [complaintBooking, setComplaintBooking] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<Booking | null>(null);
  const [filter, setFilter] = useState<FilterTab>("upcoming");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    fetch("/api/bookings?role=client")
      .then((r) => r.json())
      .then((d) => {
        const list = d.bookings ?? [];
        setBookings(list);
        setLoading(false);
        const reviewId = searchParams.get("review");
        if (reviewId) {
          const b = list.find((b: Booking) => b.id === reviewId);
          if (b && b.status === "COMPLETED") setReviewBooking(b);
        }
      })
      .catch(() => setLoading(false));
  }, [searchParams]);

  function selectTab(tab: FilterTab) {
    setFilter(tab);
    setVisible(PAGE_SIZE);
  }

  function requestCancel(bookingId: string) {
    const booking = bookings.find((b) => b.id === bookingId);
    if (booking) setCancelConfirm(booking);
  }

  async function confirmCancel() {
    if (!cancelConfirm) return;
    const bookingId = cancelConfirm.id;
    setCancelling(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (data.booking) {
        setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: "CANCELLED" } : b));
        toast.success("Запись отменена");
      } else {
        toast.error(data.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setCancelling(null); setCancelConfirm(null); }
  }

  const upcoming = bookings.filter(isUpcoming)
    .sort((a, b) => new Date(a.slot?.startAt ?? a.createdAt).getTime() - new Date(b.slot?.startAt ?? b.createdAt).getTime());
  const pastDone = bookings.filter(isPastDone);
  const cancelled = bookings.filter(isCancelled);
  const hasUpcoming = upcoming.length > 0;
  const nextUpcoming = upcoming[0];

  const tabs: { key: FilterTab; label: string; rows: Booking[] }[] = [
    { key: "upcoming", label: "Предстоящие", rows: upcoming },
    { key: "past", label: "Прошедшие", rows: pastDone },
    { key: "cancelled", label: "Отменённые", rows: cancelled },
    { key: "all", label: "Все", rows: [...upcoming, ...pastDone, ...cancelled] },
  ];
  const activeRows = tabs.find((t) => t.key === filter)?.rows ?? [];

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="soft-eyebrow">Записи</div>
        <h1 className="soft-h1 mt-2 mb-6">Мои записи</h1>
        <div className="space-y-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    );
  }

  function renderRow(b: Booking) {
    const st = getBookingStatus(b.status);
    const canReview = b.status === "COMPLETED" && !b.review;
    return (
      <div key={b.id} className="soft-card-flat" style={{ padding: "12px 16px" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{b.practitioner?.name}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--soft-ink-faint)" }}>{rowMeta(b)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="soft-badge soft-badge-warm" style={{ fontSize: 11 }}>{st.label}</span>
            {canCancelBooking(b) && (
              <button onClick={() => requestCancel(b.id)} disabled={cancelling === b.id}
                className="text-xs transition-colors disabled:opacity-50" style={{ color: "var(--soft-ink-faint)" }}>
                {cancelling === b.id ? "..." : "Отменить"}
              </button>
            )}
            {canReview && (
              <button onClick={() => setReviewBooking(b)} className="soft-chip" style={{ fontSize: 12 }}>Отзыв</button>
            )}
            {b.review && <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>Отзыв оставлен</span>}
            {b.status === "COMPLETED" && (
              <button onClick={() => setComplaintBooking(b)} className="text-xs transition-colors hover:opacity-70" style={{ color: "var(--soft-ink-faint)" }}>Жалоба</button>
            )}
          </div>
        </div>
        <JoinRail b={b} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {complaintBooking && (
        <ComplaintModal
          open={!!complaintBooking}
          bookingId={complaintBooking.id}
          practitionerName={complaintBooking.practitioner?.name ?? "Практик"}
          onClose={() => setComplaintBooking(null)}
          onSubmitted={() => setComplaintBooking(null)}
        />
      )}

      {cancelConfirm && (
        <Dialog open={!!cancelConfirm} onOpenChange={(isOpen) => { if (!isOpen) setCancelConfirm(null); }}>
          <DialogContent className="max-w-sm" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Отменить запись?</DialogTitle>
              <DialogDescription>
                Вы собираетесь отменить запись {cancelConfirm.practitioner?.name}. Это действие нельзя отменить.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button type="button" onClick={() => setCancelConfirm(null)} className="soft-button soft-button-ghost"
                style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                Оставить
              </button>
              <button type="button" onClick={confirmCancel} disabled={cancelling === cancelConfirm.id} className="soft-button soft-button-primary"
                style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                {cancelling === cancelConfirm.id ? "Отмена..." : "Да, отменить"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {reviewBooking && (
        <ReviewModal
          open={!!reviewBooking}
          bookingId={reviewBooking.id}
          practitionerName={reviewBooking.practitioner?.name ?? "Практик"}
          onSuccess={() => {
            setReviewBooking(null);
            setBookings((prev) => prev.map((b) => b.id === reviewBooking.id ? { ...b, review: { id: "done" } } : b));
          }}
          onClose={() => setReviewBooking(null)}
        />
      )}

      <div className="mb-6">
        <div className="soft-eyebrow">Записи</div>
        <h1 className="soft-h1 mt-2">Мои записи</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--soft-ink-soft)" }}>
          Ближайшая сессия сверху, вся история — ниже.
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="soft-card soft-empty-stage py-12 text-center">
          <p className="soft-h3" style={{ color: "var(--soft-bordeaux)" }}>Пока нет записей</p>
          <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
            Живой разговор со специалистом помогает там, где одного разбора мало.
          </p>
          <Link href={appUrl("/practitioners")} className="soft-button soft-button-primary mt-5 inline-flex">
            Записаться к специалисту
          </Link>
        </div>
      ) : (
        <>
          {/* Active-upcoming hero — no filter, always the nearest session. */}
          {nextUpcoming && (
            <section className="soft-card mb-6 p-5" data-testid="bookings-active-hero" style={{ borderLeft: "3px solid var(--soft-bordeaux)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="soft-eyebrow">ближайшая встреча</p>
                  <p className="mt-2" style={{ fontSize: 17, fontWeight: 600, color: "var(--soft-ink)" }}>{nextUpcoming.practitioner?.name}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>{rowMeta(nextUpcoming)}</p>
                  <p className="mt-1 text-sm">
                    <span className="soft-badge soft-badge-warm" style={{ fontSize: 11 }}>{getBookingStatus(nextUpcoming.status).label}</span>
                  </p>
                </div>
                {canCancelBooking(nextUpcoming) && (
                  <button onClick={() => requestCancel(nextUpcoming.id)} disabled={cancelling === nextUpcoming.id}
                    className="shrink-0 text-xs transition-colors disabled:opacity-50" style={{ color: "var(--soft-ink-faint)" }}>
                    {cancelling === nextUpcoming.id ? "..." : "Отменить"}
                  </button>
                )}
              </div>
              <JoinRail b={nextUpcoming} />
              {!canJoinBooking(nextUpcoming) && (
                <p className="mt-3 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                  Кнопка входа появится за 30 минут до начала.
                </p>
              )}
            </section>
          )}

          {/* История — tabs + paginated rows (round-3 #4). */}
          <section data-testid="bookings-history">
            <div className="soft-eyebrow mb-3">История</div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
              {tabs.map((tab) => (
                <button key={tab.key} role="tab" aria-selected={filter === tab.key}
                  onClick={() => selectTab(tab.key)}
                  className={filter === tab.key ? "soft-chip soft-chip-warm" : "soft-chip"}>
                  {tab.label}
                  <span className="text-xs opacity-70">{tab.rows.length}</span>
                </button>
              ))}
            </div>

            {activeRows.length === 0 ? (
              // round-4 #14: an empty «Предстоящие» never shows a dead
              // placeholder — it invites the next session instead.
              filter === "upcoming" ? (
                <InviteBlock hasPast={pastDone.length > 0} />
              ) : (
                <div className="soft-card-flat py-10 text-center">
                  <p style={{ color: "var(--soft-ink-faint)" }}>Здесь пока пусто</p>
                </div>
              )
            ) : (
              <>
                <div className="space-y-2">
                  {activeRows.slice(0, visible).map((b) => renderRow(b))}
                </div>
                {activeRows.length > visible && (
                  <button onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="soft-button soft-button-ghost mt-3 w-full"
                    style={{ minHeight: "2.25rem", fontSize: "0.875rem" }}>
                    Показать ещё
                  </button>
                )}
              </>
            )}
          </section>

          {/* «живой разговор» invite — 3-state (round-3 #6): hidden while an
              upcoming session exists; on the «Предстоящие» tab it already fills
              the empty slot above, so the bottom copy renders on other tabs only. */}
          {!hasUpcoming && filter !== "upcoming" && (
            <InviteBlock hasPast={pastDone.length > 0} className="mt-6" />
          )}
        </>
      )}
    </div>
  );
}
