"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

        // Автооткрытие модалки отзыва если ?review= в URL
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

  // Предстоящие: PENDING/CONFIRMED/IN_PROGRESS (ожидают подтверждения или активны)
  // Если у слота будущее время — upcoming; если прошедшее — past.
  function isUpcoming(b: Booking): boolean {
    if (!["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status)) return false;
    if (b.slot?.startAt) {
      return new Date(b.slot.startAt) > new Date();
    }
    // Нет слота — считаем предстоящей (ожидает назначения времени)
    return true;
  }

  // Прошедшие: COMPLETED/CANCELLED/EXPIRED или PENDING/CONFIRMED/IN_PROGRESS с прошедшим временем
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
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="premium-eyebrow">Календарь</div>
        <h1 className="premium-title mt-3 mb-6 text-3xl">Мои записи</h1>
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
        <div key={b.id}
          className="premium-card flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{b.practitioner?.name}</p>
            <p className="text-xs text-muted-foreground">
              {b.slot?.startAt ? new Date(b.slot.startAt).toLocaleDateString("ru-RU") : new Date(b.createdAt).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-primary">{b.priceRub.toLocaleString("ru")} ₽</p>
            <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
            {canReview && (
              <button
                onClick={() => setReviewBooking(b)}
                className="text-xs text-primary hover:underline">
                Отзыв
              </button>
            )}
            {b.review && (
              <span className="text-xs text-muted-foreground/60">Отзыв оставлен</span>
            )}
            {b.status === "COMPLETED" && (
              <button
                onClick={() => setComplaintBooking(b)}
                className="text-xs text-muted-foreground/50 hover:text-red-400 transition-colors">
                Жалоба
              </button>
            )}
          </div>
        </div>
      );
    }

    // Upcoming card (полная карточка)
    return (
      <Card key={b.id}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">{b.practitioner?.name}</p>
                <Badge className={st.color}>{st.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {formatSlotDate(b.slot?.startAt)}
              </p>
              <p className="text-sm font-medium text-primary mt-1">
                {b.priceRub.toLocaleString("ru")} ₽
              </p>
            </div>
            {(b.status === "PENDING" || (b.status === "CONFIRMED" && b.slot && new Date(b.slot.startAt) > new Date())) && (
              <button
                onClick={() => requestCancel(b.id)}
                disabled={cancelling === b.id}
                className="shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
                {cancelling === b.id ? "..." : "Отменить"}
              </button>
            )}
          </div>
          {b.status === "CONFIRMED" && (
            <div className="mt-3 flex items-center justify-between rounded-[var(--radius-control)] border border-emerald-400/25 bg-emerald-400/10 px-3 py-2">
              <p className="text-xs text-emerald-200">Сессия подтверждена</p>
              <a href={b.sessionUrl ?? `/session/${b.id}`}
                className="rounded-full bg-[linear-gradient(180deg,var(--brand-soft-gold),var(--brand-warm-gold))] px-3 py-1.5 text-xs font-semibold text-navy transition-[filter,transform] hover:brightness-105 active:scale-[0.96]">
                Войти в сессию
              </a>
            </div>
          )}
          {b.status === "IN_PROGRESS" && (
            <div className="mt-3 flex items-center justify-between rounded-[var(--radius-control)] border border-brand-lavender/25 bg-brand-lavender/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-soft-gold animate-pulse" />
                <p className="text-xs text-brand-lavender-light">Сессия идёт</p>
              </div>
              <a href={b.sessionUrl ?? `/session/${b.id}`}
                className="rounded-full border border-brand-lavender/35 bg-brand-lavender/20 px-3 py-1.5 text-xs font-semibold text-brand-lavender-light transition-colors hover:bg-brand-lavender/30">
                Подключиться
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
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
                className="rounded-lg border border-border/40 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Оставить
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelling === cancelConfirm.id}
                className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50"
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
            // Помечаем что отзыв оставлен
            setBookings((prev) => prev.map((b) =>
              b.id === reviewBooking.id ? { ...b, review: { id: "done" } } : b
            ));
          }}
          onClose={() => setReviewBooking(null)}
        />
      )}

      <div className="mb-6">
        <div className="premium-eyebrow">Календарь</div>
        <h1 className="premium-title mt-3 text-3xl md:text-4xl">Мои записи</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Ближайшие сессии, история встреч, отзывы и обращения в поддержку собраны в одном месте.
        </p>
      </div>

      {bookings.length === 0 && (
        <div className="premium-card py-12 text-center">
          <p className="text-muted-foreground">Нет записей к практикам</p>
          <Link href={appUrl("/cabinet/practitioners")} className="mt-4 inline-flex rounded-full border border-brand-soft-gold/30 px-4 py-2 text-sm text-brand-soft-gold transition-colors hover:bg-brand-soft-gold/10">
            Найти практика
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
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? "bg-[linear-gradient(180deg,var(--brand-soft-gold),var(--brand-warm-gold))] text-navy shadow-[var(--shadow-halo-gold)]"
                    : "border border-border/30 bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Filter: upcoming only */}
          {filter === "upcoming" && upcoming.length === 0 && (
            <div className="premium-card py-12 text-center">
              <p className="text-muted-foreground">Нет предстоящих записей</p>
            </div>
          )}

          {/* Filter: past only */}
          {filter === "past" && past.length === 0 && (
            <div className="premium-card py-12 text-center">
              <p className="text-muted-foreground">Нет прошедших записей</p>
            </div>
          )}

          {/* "All" filter: upcoming at top, past section below */}
          {filter === "all" && (
            <>
              {upcoming.length > 0 && (
                <div className="mb-8">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Предстоящие
                  </h2>
                  <div className="space-y-3">
                    {upcoming.map((b) => renderBookingCard(b))}
                  </div>
                </div>
              )}

              {past.length > 0 && (
                <div>
                  <button
                    onClick={() => setPastCollapsed(!pastCollapsed)}
                    className="w-full flex items-center justify-between mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Прошедшие</span>
                    {pastCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
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

          {/* "Upcoming" filter: just upcoming */}
          {filter === "upcoming" && upcoming.length > 0 && (
            <div className="space-y-3">
              {upcoming.map((b) => renderBookingCard(b))}
            </div>
          )}

          {/* "Past" filter: just past */}
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
