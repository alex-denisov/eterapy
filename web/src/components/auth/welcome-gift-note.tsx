import { WELCOME_CREDIT_AMOUNT } from "@/lib/welcome-credit-copy";

/**
 * B760 — строка про приветственный подарок. Срок не пишем: его называет
 * платформа при начислении. Подарок начисляется после подтверждения почты.
 */
export function WelcomeGiftNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-[var(--soft-ink-soft)] ${className}`} data-testid="welcome-gift-note">
      Подарок: {WELCOME_CREDIT_AMOUNT} балла после подтверждения почты.
    </p>
  );
}
