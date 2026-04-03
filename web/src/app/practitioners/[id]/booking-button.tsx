"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BookingButton({
  practitionerName,
  nextSlot,
}: {
  practitionerName: string;
  nextSlot: string | null;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [booked, setBooked] = useState(false);

  function handleBook() {
    if (!session) {
      router.push("/register");
      return;
    }
    // TODO: открыть модальное окно выбора времени
    setBooked(true);
    setTimeout(() => setBooked(false), 3000);
  }

  return (
    <div className="mt-4 space-y-2">
      <Button
        className="w-full"
        size="lg"
        onClick={handleBook}
        disabled={!nextSlot}
      >
        {booked
          ? "✓ Запись отправлена"
          : !nextSlot
          ? "Нет доступных слотов"
          : session
          ? "Записаться"
          : "Зарегистрироваться и записаться"}
      </Button>
      {!session && (
        <p className="text-center text-xs text-muted-foreground">
          Для записи нужен аккаунт · Бесплатно
        </p>
      )}
    </div>
  );
}
