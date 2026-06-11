"use client";

import Link from "next/link";
import { ArrowRight, Calendar, Users, ShieldCheck } from "lucide-react";

// B309: Joint-session booking surface.
//
// Spec (03_Platform_Pages_and_Requirements + 04_UI_UX_Mechanics §11):
// "Эзотерик + психотерапевт" is a live 60-minute session led by two
// specialists. The product page must surface a CTA to pick practitioners
// and book — historically this returned `null` from ProductActionSurface,
// leaving the user with marketing copy and no way to proceed.
//
// We deliberately do NOT inline a checkout flow here because the price is
// "от 4 500 ₽" (full specialist rates, not credits) and pairing two
// specialists requires the existing /practitioners filter UI. We send the
// user there with `format=joint-session` preselected and a "what to expect"
// reminder card to set expectations.

export function JointSessionActions() {
  return (
    <div
      className="soft-card soft-form-panel mt-8"
      data-testid="joint-session-actions"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">записаться на встречу</p>
          <h2 className="soft-h3 mt-2">Эзотерик + психотерапевт · 60 минут</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Подбор двух специалистов под ваш запрос. Оплата идёт по полным
            ставкам обоих специалистов, без скидок и баллов — это совместный
            живой разговор, а не цифровой формат.
          </p>
        </div>
        <span className="soft-badge soft-badge-warm">от 4 500 ₽</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="joint-session-pillars">
        <div className="soft-card-flat p-4">
          <Calendar className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-semibold text-[var(--soft-bordeaux)]">
            60 минут онлайн
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Видеовстреча по согласованному протоколу.
          </p>
        </div>
        <div className="soft-card-flat p-4">
          <Users className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-semibold text-[var(--soft-bordeaux)]">
            Два специалиста
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Эзотерик ведёт символический язык, психотерапевт удерживает
            безопасный следующий шаг.
          </p>
        </div>
        <div className="soft-card-flat p-4">
          <ShieldCheck className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-semibold text-[var(--soft-bordeaux)]">
            Согласованный протокол
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Контекст передаётся специалистам только после вашего согласия
            перед записью.
          </p>
        </div>
      </div>

      <Link
        href="/practitioners?format=joint-session"
        className="soft-button soft-button-primary mt-6 inline-flex"
        data-testid="joint-session-pick-cta"
        data-analytics-event="joint_session_pick_clicked"
      >
        Подобрать специалистов
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
      <p className="mt-3 text-xs text-[var(--soft-ink-faint)]">
        Сначала выбираете двух специалистов и время, потом — оплата по их
        полным ставкам. Возможен возврат до начала встречи по нашей политике.
      </p>
    </div>
  );
}
