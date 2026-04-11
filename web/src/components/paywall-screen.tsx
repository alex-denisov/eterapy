"use client";

import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

interface PaywallScreenProps {
  /** Баланс пользователя в копейках */
  balanceKopecks?: number;
  /** Цена полного расклада в копейках */
  fullPriceKopecks?: number;
  /** Кнопка "Начать заново" — сбрасывает состояние родителя */
  onReset?: () => void;
}

export function PaywallScreen({ balanceKopecks, fullPriceKopecks, onReset }: PaywallScreenProps) {
  const isBalancePaywall = fullPriceKopecks != null && balanceKopecks != null;
  const deficitKopecks = isBalancePaywall ? fullPriceKopecks - balanceKopecks : 0;
  const deficitRub = (deficitKopecks / 100).toLocaleString("ru-RU");
  const balanceRub = ((balanceKopecks ?? 0) / 100).toLocaleString("ru-RU");
  const fullRub = fullPriceKopecks ? (fullPriceKopecks / 100).toLocaleString("ru-RU") : "299";

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-primary/20 bg-card/40 p-8 text-center">
      <div className="mb-4 text-5xl">{isBalancePaywall ? "🔮" : "✦"}</div>

      {isBalancePaywall ? (
        <>
          <h2 className="font-heading text-xl font-bold">Недостаточно средств для полного расклада</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Полный расклад стоит <strong className="text-foreground">{fullRub} ₽</strong>.
            На вашем балансе: <strong className="text-foreground">{balanceRub} ₽</strong>.
            Необходимо пополнить ещё на <strong className="text-primary">{deficitRub} ₽</strong>.
          </p>
        </>
      ) : (
        <>
          <h2 className="font-heading text-xl font-bold">Лимит бесплатных раскладов исчерпан</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Вы использовали 3&nbsp;из&nbsp;3 бесплатных быстрых раскладов в этом месяце.
            Лимит обновится&nbsp;1-го числа следующего месяца.
          </p>
        </>
      )}

      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {isBalancePaywall ? "Пополните баланс" : "ETerapy+"}
        </p>
        <p className="mt-1 font-heading text-2xl font-bold">
          {isBalancePaywall
            ? `${fullRub}\u00A0₽`
            : `499\u00A0<span class="text-base font-normal text-muted-foreground">₽/мес</span>`}
        </p>
        <ul className="mt-3 space-y-1.5 text-left text-sm text-muted-foreground">
          {isBalancePaywall ? (
            <>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Полный расклад — 5 карт, детальный анализ</li>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>5 сфер жизни + рекомендации</li>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Результат сохраняется в истории</li>
            </>
          ) : (
            <>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Неограниченные направления самопознания</li>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Скидка 10% на все сессии</li>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-primary">✓</span>Персональный AI-дайджест</li>
            </>
          )}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/cabinet/billing"
          className={cn(buttonVariants({ variant: "default" }), "w-full")}
        >
          {isBalancePaywall ? `Пополнить на ${deficitRub} ₽` : "Подключить ETerapy+"}
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
            ← Вернуться к быстрому раскладу
          </button>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground/40">
        {isBalancePaywall
          ? "Быстрые расклады по-прежнему бесплатны (если лимит не исчерпан)"
          : "Живая сессия с практиком — без ограничений."}
      </p>
    </div>
  );
}
