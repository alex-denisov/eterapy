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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp } from "lucide-react";

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

type FilterTab = "upcoming" | "past" | "all";

export default function ClientBookingsPage() {
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [complaintBooking, setComplaintBooking] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<Booking | null>(null);
  const [filter, setFilter] = useState<FilterTab>("upcoming");
  const [pastCollapsed, setPastCollapsed] = useState(false);

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

  function isUpcoming(b: Booking): boolean {
    if (!["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status)) return false;
    if (b.slot?.startAt) {
      return new Date(b.slot.startAt) > new Date();
    }
    return true;
  }

  function isPast(b: Booking): boolean {
    if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(b.status)) return true;
    if (["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot?.startAt) {
      return new Date(b.slot.startAt) <= new Date();
    }
    return false;
  }

  const upcoming = bookings.filter(isUpcoming);
  const past = bookings.filter(isPast);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "upcoming", label: "Предстоящие", count: upcoming.length },
    { key: "past", label: "Прошедшие", count: past.length },
    { key: "all", label: "Все", count: bookings.length },
  ];

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="soft-eyebrow">Записи</div>
        <h1 className="soft-h1 mt-2 mb-6">Мои записи</h1>
        <div className="space-y-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    );
  }

  function formatSlotDate(startAt: string | null | undefined): string {
    if (!startAt) return "Время уточняется";
    const d = new Date(startAt);
    if (isNaN(d.getTime())) return "Время уточняется";
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderBookingCard(b: Booking) {
    const st = getBookingStatus(b.status);
    const canReview = b.status === "COMPLETED" && !b.review;
    const isPastCard = !isUpcoming(b);

    if (isPastCard) {
      return (
        <div key={b.id} className="soft-card-flat flex items-center justify-between gap-4"
          style={{ padding: "12px 16px" }}>
          <div>
            <p className="text-sm font-medium">{b.practitioner?.name}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--soft-ink-faint)" }}>
              {b.slot?.startAt ? new Date(b.slot.startAt).toLocaleDateString("ru-RU") : new Date(b.createdAt).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: "var(--font-heading)", color: "var(--soft-bordeaux)", fontWeight: 600 }}>
              {b.priceRub.toLocaleString("ru")} ₽
            </span>
            <span className="soft-badge soft-badge-warm" style={{ fontSize: 11 }}>{st.label}</span>
            {canReview && (
              <button onClick={() => setReviewBooking(b)} className="soft-chip" style={{ fontSize: 12 }}>
                Отзыв
              </button>
            )}
            {b.review && (
              <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>Отзыв оставлен</span>
            )}
            {b.status === "COMPLETED" && (
              <button
                onClick={() => setComplaintBooking(b)}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: "var(--soft-ink-faint)" }}>
                Жалоба
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={b.id} className="soft-card" style={{ padding: 20 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">{b.practitioner?.name}</p>
              <span className="soft-badge soft-badge-warm" style={{ fontSize: 11 }}>{st.label}</span>
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--soft-ink-soft)" }}>
              {formatSlotDate(b.slot?.startAt)}
            </p>
            <p className="text-sm font-medium mt-1" style={{ fontFamily: "var(--font-heading)", color: "var(--soft-bordeaux)" }}>
              {b.priceRub.toLocaleString("ru")} ₽
            </p>
          </div>
          {(b.status === "PENDING" || (b.status === "CONFIRMED" && b.slot && new Date(b.slot.startAt) > new Date())) && (
            <button
              onClick={() => requestCancel(b.id)}
              disabled={cancelling === b.id}
              className="shrink-0 text-xs transition-colors disabled:opacity-50"
              style={{ color: "var(--soft-ink-faint)" }}>
              {cancelling === b.id ? "..." : "Отменить"}
            </button>
          )}
        </div>
        {b.status === "CONFIRMED" && (
          <div className="mt-3 flex items-center justify-between rounded-xl p-3"
            style={{ background: "rgba(155, 174, 148, 0.15)", border: "1px solid rgba(155, 174, 148, 0.3)" }}>
            <p className="text-xs" style={{ color: "var(--soft-sage)" }}>Сессия подтверждена</p>
            <a href={b.sessionUrl ?? `/session/${b.id}`} className="soft-button soft-button-primary"
              style={{ minHeight: "2rem", padding: "0.4rem 1rem", fontSize: "0.8rem" }}>
              Войти в сессию
            </a>
          </div>
        )}
        {b.status === "IN_PROGRESS" && (
          <div className="mt-3 flex items-center justify-between rounded-xl p-3"
            style={{ background: "rgba(168, 155, 201, 0.15)", border: "1px solid rgba(168, 155, 201, 0.3)" }}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--soft-terracotta)" }} />
              <p className="text-xs" style={{ color: "var(--soft-lilac)" }}>Сессия идёт</p>
            </div>
            <a href={b.sessionUrl ?? `/session/${b.id}`} className="soft-button soft-button-ghost"
              style={{ minHeight: "2rem", padding: "0.4rem 1rem", fontSize: "0.8rem" }}>
              Подключиться
            </a>
          </div>
        )}
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
              <button
                type="button"
                onClick={() => setCancelConfirm(null)}
                className="soft-button soft-button-ghost"
                style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
              >
                Оставить
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelling === cancelConfirm.id}
                className="soft-button soft-button-primary"
                style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
              >
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
            setBookings((prev) => prev.map((b) =>
              b.id === reviewBooking.id ? { ...b, review: { id: "done" } } : b
            ));
          }}
          onClose={() => setReviewBooking(null)}
        />
      )}

      <div className="mb-6">
        <div className="soft-eyebrow">Записи</div>
        <h1 className="soft-h1 mt-2">Мои записи</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--soft-ink-soft)" }}>
          Ближайшие сессии, история встреч, отзывы и обращения в поддержку собраны в одном месте.
        </p>
      </div>

      {bookings.length === 0 && (
        <div className="soft-card py-12 text-center">
          <p className="soft-h3" style={{ color: "var(--soft-bordeaux)" }}>Пока нет записей</p>
          <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
            Живой разговор со специалистом помогает там, где одного разбора мало.
          </p>
          <Link href={appUrl("/practitioners")}
            className="soft-button soft-button-primary mt-5 inline-flex">
            Записаться к специалисту
          </Link>
        </div>
      )}

      {bookings.length > 0 && (
        <>
          {/* Filter tabs */}
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={filter === tab.key}
                onClick={() => setFilter(tab.key)}
                className={filter === tab.key ? "soft-chip soft-chip-warm" : "soft-chip"}
              >
                {tab.label}
                <span className="text-xs opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>

          {filter === "upcoming" && upcoming.length === 0 && (
            <div className="soft-card py-10 text-center">
              <p style={{ color: "var(--soft-ink-soft)" }}>Нет ближайших записей</p>
              <Link href={appUrl("/practitioners")}
                className="soft-button soft-button-primary mt-4 inline-flex">
                Записаться к специалисту
              </Link>
            </div>
          )}

          {filter === "past" && past.length === 0 && (
            <div className="soft-card-flat py-12 text-center">
              <p style={{ color: "var(--soft-ink-faint)" }}>Нет прошедших записей</p>
            </div>
          )}

          {filter === "all" && (
            <>
              {upcoming.length > 0 && (
                <div className="mb-8">
                  <div className="soft-eyebrow mb-3">Предстоящие</div>
                  <div className="space-y-3">
                    {upcoming.map((b) => renderBookingCard(b))}
                  </div>
                </div>
              )}

              {past.length > 0 && (
                <div>
                  <button
                    onClick={() => setPastCollapsed(!pastCollapsed)}
                    className="w-full flex items-center justify-between mb-3"
                  >
                    <div className="soft-eyebrow">Прошедшие</div>
                    {pastCollapsed
                      ? <ChevronDown className="w-4 h-4" style={{ color: "var(--soft-ink-faint)" }} />
                      : <ChevronUp className="w-4 h-4" style={{ color: "var(--soft-ink-faint)" }} />
                    }
                  </button>
                  {!pastCollapsed && (
                    <div className="space-y-2">
                      {past.map((b) => renderBookingCard(b))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {filter === "upcoming" && upcoming.length > 0 && (
            <div className="space-y-3">
              {upcoming.map((b) => renderBookingCard(b))}
            </div>
          )}

          {filter === "past" && past.length > 0 && (
            <div className="space-y-2">
              {past.map((b) => renderBookingCard(b))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
