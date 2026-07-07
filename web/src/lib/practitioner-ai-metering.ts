// B466/B434 — серверный метеринг AI-разборов практика.
//
// Правила (owner-frozen): разбор сессии (резюме+заметки+сообщение) доступен на
// Pro (20/мес) и Pro+ (50/мес); сверх квоты — докупленный пул (+10/+25/+50).
// Расшифровка (server-STT) и комплаенс НЕ метерятся и работают всегда.
// Разбор можно выключить: глобально (Practitioner.aiAutoAnalyze) или на
// конкретной сессии (Booking.aiAnalysisEnabled, null → глобальный дефолт).
//
// Ledger: PractitionerAiAnalysis — одна строка на разобранную видеосессию
// (unique videoSessionId ⇒ идемпотентно; регенерация НЕ тратит новую единицу).

import db from "@/lib/db";
import { MSK_OFFSET_MS } from "@/lib/msk-time";
import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import {
  AI_ANALYSES_INCLUDED,
  mskMonthRange,
} from "@/lib/practitioner-ai-quota";

/** «2026-07» — календарный месяц МСК. */
export function periodKeyFor(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getAnalysesUsedThisMonth(practitionerId: string, now: Date = new Date()): Promise<number> {
  return db.practitionerAiAnalysis.count({
    where: { practitionerId, periodKey: periodKeyFor(now) },
  });
}

/** НЕТТО-остаток докупленного пула (покупки минус все topup-списания). */
export async function getTopupBalance(practitionerId: string): Promise<number> {
  const [purchased, used] = await Promise.all([
    db.practitionerAiTopup.aggregate({
      where: { practitionerId },
      _sum: { units: true },
    }),
    db.practitionerAiAnalysis.count({ where: { practitionerId, source: "topup" } }),
  ]);
  return Math.max(0, (purchased._sum.units ?? 0) - used);
}

export type AnalysisDenyReason = "tier" | "toggle" | "quota";

export interface AnalysisEligibility {
  allowed: boolean;
  reason?: AnalysisDenyReason;
  /** Откуда спишется единица при генерации. */
  source?: "included" | "topup";
}

/**
 * Можно ли сгенерировать AI-разбор для этой сессии. Уже разобранная сессия
 * (строка в ledger) всегда allowed — регенерация бесплатна.
 */
export async function resolveAnalysisEligibility({
  practitionerId,
  practitionerUserId,
  bookingId,
  videoSessionId,
  now = new Date(),
}: {
  practitionerId: string;
  practitionerUserId: string;
  bookingId: string;
  videoSessionId?: string;
  now?: Date;
}): Promise<AnalysisEligibility> {
  if (videoSessionId) {
    const existing = await db.practitionerAiAnalysis.findUnique({
      where: { videoSessionId },
      select: { source: true },
    });
    if (existing) return { allowed: true, source: existing.source as "included" | "topup" };
  }

  const [practitioner, booking, planKey] = await Promise.all([
    db.practitioner.findUnique({ where: { id: practitionerId }, select: { aiAutoAnalyze: true } }),
    db.booking.findUnique({ where: { id: bookingId }, select: { aiAnalysisEnabled: true } }),
    getActivePractitionerPlanKey(practitionerUserId, db, now),
  ]);

  const tier = practitionerTierFromPlanKey(planKey);
  if (AI_ANALYSES_INCLUDED[tier] <= 0) return { allowed: false, reason: "tier" };

  const enabled = booking?.aiAnalysisEnabled ?? practitioner?.aiAutoAnalyze ?? true;
  if (!enabled) return { allowed: false, reason: "toggle" };

  const [used, topup] = await Promise.all([
    getAnalysesUsedThisMonth(practitionerId, now),
    getTopupBalance(practitionerId),
  ]);
  if (used < AI_ANALYSES_INCLUDED[tier]) return { allowed: true, source: "included" };
  if (topup > 0) return { allowed: true, source: "topup" };
  return { allowed: false, reason: "quota" };
}

/**
 * B434 — авто-докупка: при исчерпании квоты и включённом aiAutoTopup покупает
 * минимальный пакет (+10) из дохода практика. Возвращает true при успехе.
 */
export async function attemptAutoTopup(practitionerId: string): Promise<boolean> {
  const practitioner = await db.practitioner.findUnique({
    where: { id: practitionerId },
    select: { userId: true, aiAutoTopup: true },
  });
  if (!practitioner?.aiAutoTopup) return false;

  const { AI_TOPUP_PACKS } = await import("@/lib/practitioner-ai-quota");
  const { computePractitionerBalance } = await import("@/lib/practitioner-balance");
  const pack = AI_TOPUP_PACKS[0];
  const priceKopecks = pack.priceRub * 100;
  const balance = await computePractitionerBalance(practitionerId);
  const availableKopecks = Math.max(0, balance?.currentBalance ?? 0) * 100;
  if (availableKopecks < priceKopecks) return false;

  await db.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId: practitioner.userId,
        amount: priceKopecks,
        status: "SUCCEEDED",
        provider: "internal",
        description: `Авто-докупка AI-разборов +${pack.units}: оплата из дохода практика`,
        metadata: {
          purchaseKind: "practitioner_ai_topup",
          units: pack.units,
          checkoutSource: "practitioner_earnings_balance",
          auto: true,
        },
      },
      select: { id: true },
    });
    await tx.practitionerAiTopup.create({
      data: {
        practitionerId,
        units: pack.units,
        amountKopecks: priceKopecks,
        transactionId: transaction.id,
      },
    });
  });
  return true;
}

/** Списывает единицу квоты за разбор сессии (идемпотентно по videoSessionId). */
export async function consumeAnalysis({
  practitionerId,
  videoSessionId,
  source,
  now = new Date(),
}: {
  practitionerId: string;
  videoSessionId: string;
  source: "included" | "topup";
  now?: Date;
}): Promise<void> {
  await db.practitionerAiAnalysis.upsert({
    where: { videoSessionId },
    create: { practitionerId, videoSessionId, source, periodKey: periodKeyFor(now) },
    update: {},
  });
}

/** Начало/конец текущего МСК-месяца (для отчётных выборок). */
export function currentPeriodRange(now: Date = new Date()): { start: Date; end: Date } {
  return mskMonthRange(now);
}
