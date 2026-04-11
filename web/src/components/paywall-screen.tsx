"use client";

import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

interface PaywallScreenProps {
  /** Кнопка "Начать заново" — сбрасывает состояние родителя */
  onReset?: () => void;
}

export function PaywallScreen({ onReset }: PaywallScreenProps) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-primary/20 bg-card/40 p-8 text-center">
      <div className="mb-4 text-5xl">✦</div>
      <h2 className="font-heading text-xl font-bold">Лимит бесплатных сессий исчерпан</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Вы использовали 3&nbsp;из&nbsp;3 бесплатных AI-сессий в этом месяце.
        Лимит обновится&nbsp;1-го числа следующего месяца.
      </p>

      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">ETerapy+</p>
        <p className="mt-1 font-heading text-2xl font-bold">
          499&nbsp;<span className="text-base font-normal text-muted-foreground">₽/мес</span>
        </p>
        <ul className="mt-3 space-y-1.5 text-left text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Неограниченные направления самопознания</li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Скидка 10% на все сессии</li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Персональный AI-дайджест</li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Приоритетная поддержка</li>
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/cabinet/billing"
          className={cn(buttonVariants({ variant: "default" }), "w-full")}
        >
          Подключить ETerapy+
        </Link>
        <Link
          href="/practitioners"
          className={cn(buttonVariants({ variant: "outline" }), "w-full border-border/40 text-muted-foreground")}
        >
          Записаться к практику
        </Link>
        {onReset && (
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            ← Вернуться
          </button>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground/40">
        Живая сессия с практиком — без ограничений.
      </p>
    </div>
  );
}
