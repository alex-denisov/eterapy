/**
 * B483 — периодическая перепроверка налогового статуса практиков.
 *
 * Статус самозанятого/ИП может «слететь» после первичного подтверждения.
 * Раз в интервал перепроверяем VERIFIED-практиков через провайдер:
 *   • активен → продлеваем taxStatusVerifiedAt;
 *   • реестр явно говорит «неактивен» → taxReviewStatus=EXPIRED (гейт выплат
 *     isTaxStatusVerified закрывается автоматически) + уведомление практику;
 *   • провайдер недоступен/выключен → ничего не меняем (fail-open по
 *     доступности: не наказываем за наш аутэйдж, только за данные реестра).
 *
 * Вызывается из cron.practitioner-sync (см. cron-jobs.ts) — отдельного
 * crontab-входа не требуется. Батч мал, чтобы уважать глобальные rate-guard'ы
 * провайдера (NPD 2/мин).
 */
import db from "./db";
import { log } from "./logger";
import { notify } from "./notifications";
import { logAudit } from "./audit";
import { lookupTaxIdentity } from "./practitioner-tax-verification-provider";
import type { TaxStatusKey } from "./practitioner-tax-verification";

export const TAX_RECHECK_INTERVAL_DAYS = 30;
export const TAX_RECHECK_BATCH_SIZE = 2;

export interface TaxRecheckResult {
  scanned: number;
  extended: number;
  expired: number;
  skipped: number;
}

export async function recheckVerifiedTaxStatuses(now: Date = new Date()): Promise<TaxRecheckResult> {
  const dueBefore = new Date(now.getTime() - TAX_RECHECK_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  const due = await db.practitioner.findMany({
    where: {
      taxReviewStatus: "VERIFIED",
      inn: { not: null },
      taxStatusVerifiedAt: { lte: dueBefore },
    },
    select: {
      id: true,
      userId: true,
      inn: true,
      taxStatus: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { taxStatusVerifiedAt: "asc" },
    take: TAX_RECHECK_BATCH_SIZE,
  });

  const result: TaxRecheckResult = { scanned: due.length, extended: 0, expired: 0, skipped: 0 };

  for (const practitioner of due) {
    const lookup = await lookupTaxIdentity({
      inn: practitioner.inn!,
      status: practitioner.taxStatus as TaxStatusKey,
      fallbackDisplayName: practitioner.user.name ?? practitioner.user.email ?? "—",
    }).catch(() => null);

    if (!lookup) {
      // Провайдер выключен/недоступен — не трогаем статус.
      result.skipped += 1;
      continue;
    }

    if (lookup.active) {
      await db.practitioner.update({
        where: { id: practitioner.id },
        data: { taxStatusVerifiedAt: now },
      });
      result.extended += 1;
      continue;
    }

    await db.practitioner.update({
      where: { id: practitioner.id },
      data: {
        taxReviewStatus: "EXPIRED",
        taxStatusRejectedReason: "Статус не подтверждается реестром при плановой перепроверке",
      },
    });
    result.expired += 1;
    await logAudit(
      practitioner.userId,
      "TAX_STATUS_EXPIRED",
      undefined,
      `Плановая перепроверка: реестр (${lookup.source}) не подтверждает статус — выплаты приостановлены до повторной проверки`,
    );
    notify({
      userId: practitioner.userId,
      event: "COMPLIANCE_ALERT",
      data: {
        reason: "Налоговый статус не подтвердился при плановой перепроверке — "
          + "обновите данные в «Финансы → Налоговый статус», выплаты приостановлены",
      },
      dedupeKey: `tax-expired:${practitioner.id}:${now.toISOString().slice(0, 10)}`,
    }).catch((e: unknown) => log.warn("tax-recheck.notify_failed", { practitionerId: practitioner.id, err: e }));
  }

  return result;
}
