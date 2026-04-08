"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function BookingButton({
  practitionerName,
  practitionerId,
  nextSlot,
}: {
  practitionerName: string;
  practitionerId: string;
  nextSlot: string | null;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);

  async function handleBook() {
    if (!session) {
      toast("Нужен аккаунт", {
        description: "Зарегистрируйтесь чтобы записаться к практику",
        action: { label: "Регистрация", onClick: () => router.push("/register") },
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/booking/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId,
          practitionerName,
          slot: nextSlot,
          clientName: session.user?.name,
          clientEmail: session.user?.email,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBooked(true);
        toast.success("Запрос отправлен!", {
          description: `${practitionerName} получит уведомление о вашем запросе.`,
        });
      } else {
        toast.error(data.error || "Не удалось отправить запрос");
      }
    } catch {
      toast.error("Ошибка сети. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <Button
        className="w-full"
        size="lg"
        onClick={handleBook}
        disabled={!nextSlot || loading || booked}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Отправляем...
          </span>
        ) : booked ? (
          "✓ Запрос отправлен"
        ) : !nextSlot ? (
          "Нет доступных слотов"
        ) : session ? (
          "Записаться"
        ) : (
          "Зарегистрироваться и записаться"
        )}
      </Button>
      {!session && nextSlot && (
        <p className="text-center text-xs text-muted-foreground">
          Для записи нужен аккаунт · Бесплатно
        </p>
      )}
    </div>
  );
}
