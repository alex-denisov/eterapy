"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ReviewModal } from "@/components/review-modal";
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

  // Определяем, является ли запись "предстоящей"
  // Предстоящие: CONFIRMED/IN_PROGRESS с будущим временем слота
  function isUpcoming(b: Booking): boolean {
    if (!["CONFIRMED", "IN_PROGRESS"].includes(b.status)) return false;
    if (b.slot?.startAt) {
      return new Date(b.slot.startAt) > new Date();
    }
    // Если слота нет, но статус PENDING — считаем предстоящей
    if (b.status === "PENDING") return true;
    return false;
  }

  // Прошедшие: COMPLETED/CANCELLED/EXPIRED или CONFIRMED/IN_PROGRESS с прошедшим временем
  function isPast(b: Booking): boolean {
    if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(b.status)) return true;
    if (["CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot?.startAt) {
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

  function getVisibleBookings(): Booking[] {
    if (filter === "upcoming") return upcoming;
    if (filter === "past") return past;
    return bookings;
  }

  const visibleBookings = getVisibleBookings();

  if (loading) {
    return (
      <div className="px-6 py-8">
        <h1 className="font-heading text-2xl font-bold mb-6">Мои записи</h1>
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
          className="flex items-center justify-between rounded-xl border border-border/20 bg-card/20 px-4 py-3">
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
      <Card key={b.id} className="border-border/40 bg-card/40">
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
            <div className="mt-3 rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2 flex items-center justify-between">
              <p className="text-xs text-green-400">✓ Сессия подтверждена</p>
              <a href={b.sessionUrl ?? `/session/${b.id}`}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-navy hover:bg-primary/90 transition-colors">
                Войти в сессию →
              </a>
            </div>
          )}
          {b.status === "IN_PROGRESS" && (
            <div className="mt-3 rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <p className="text-xs text-blue-400">Сессия идёт</p>
              </div>
              <a href={b.sessionUrl ?? `/session/${b.id}`}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors animate-pulse">
                Подключиться →
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="px-6 py-8 max-w-3xl">
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

      <h1 className="font-heading text-2xl font-bold mb-6">Мои записи</h1>

      {bookings.length === 0 && (
        <div className="rounded-xl border border-border/30 bg-card/20 py-12 text-center">
          <p className="text-muted-foreground">Нет записей к практикам</p>
          <Link href="/cabinet/practitioners" className="mt-4 inline-block text-sm text-primary hover:underline">
            Найти практика →
          </Link>
        </div>
      )}

      {bookings.length > 0 && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-2 mb-6" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={filter === tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card/60 border border-border/30"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Filter: upcoming only */}
          {filter === "upcoming" && upcoming.length === 0 && (
            <div className="rounded-xl border border-border/30 bg-card/20 py-12 text-center">
              <p className="text-muted-foreground">Нет предстоящих записей</p>
            </div>
          )}

          {/* Filter: past only */}
          {filter === "past" && past.length === 0 && (
            <div className="rounded-xl border border-border/30 bg-card/20 py-12 text-center">
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
