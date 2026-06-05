/**
 * Complaint resolution + payout/refund decision.
 *
 * Backlog 11.C.3: when a complaint filed during a session is resolved by
 * a moderator/superadmin, the practitioner's HELD payout for that booking
 * must be either released (→ PENDING) or withheld (→ FAILED + client refund).
 *
 * The decision only applies when:
 *   - the complaint transitions to RESOLVED or CLOSED for the first time, AND
 *   - there is a HELD payout linked to the same booking.
 *
 * If the complaint was filed AFTER session end (11.C.4) the linked payout
 * is already PENDING/PROCESSING/DONE — in that case `applyPayoutDecision`
 * is a no-op on the money side, but the complaint is still resolved.
 *
 * Refund semantics (withhold):
 *   - The client's session-start charge is reversed by writing a positive
 *     Transaction row and incrementing User.balance by the full session
 *     price (kopecks). The platform absorbs the loss in addition to giving
 *     up the practitioner's net.
 *
 * Idempotency:
 *   - The HELD→PENDING / HELD→FAILED flip uses a conditional updateMany
 *     gated on `status = HELD`. A second call after resolution finds no
 *     HELD payout and returns `payoutAction: "none"` without re-refunding.
 */
import db from "./db";
import { logAudit } from "./audit";
import { notify } from "./notifications";
import { PAYOUT_STATUS_HELD, PAYOUT_STATUS_PENDING, PAYOUT_STATUS_FAILED } from "./session-complete";
import { refundSessionForBooking } from "./session-payment";
import { log } from "./logger";

export type PayoutDecision = "release" | "withhold";

export type ResolveComplaintOutcome =
  | {
      status: "ok";
      complaintStatus: "OPEN" | "REVIEWING" | "RESOLVED" | "CLOSED";
      payoutAction: "released" | "withheld" | "none";
      heldPayoutId?: string;
    }
  | { status: "not_found" }
  | { status: "invalid_status"; current: string }
  | { status: "decision_required"; heldKopecks: number; heldPayoutId: string };

export interface ResolveComplaintInput {
  complaintId: string;
  /** New complaint status; resolver always sets resolvedAt when it lands on RESOLVED or CLOSED. */
  status: "OPEN" | "REVIEWING" | "RESOLVED" | "CLOSED";
  /** Free-form moderator note. */
  resolution?: string | null;
  /** Required when transitioning to RESOLVED/CLOSED with a HELD payout present. */
  payoutDecision?: PayoutDecision;
}

export interface ResolveComplaintActor {
  userId: string;
}

export async function resolveComplaint(
  input: ResolveComplaintInput,
  actor: ResolveComplaintActor,
): Promise<ResolveComplaintOutcome> {
  const complaint = await db.complaint.findUnique({
    where: { id: input.complaintId },
    select: {
      id: true,
      status: true,
      bookingId: true,
      booking: { select: { id: true, clientId: true, priceRub: true } },
    },
  });
  if (!complaint) return { status: "not_found" };

  const validStatuses = ["OPEN", "REVIEWING", "RESOLVED", "CLOSED"] as const;
  if (!validStatuses.includes(input.status)) {
    return { status: "invalid_status", current: complaint.status };
  }

  const movingToTerminal = input.status === "RESOLVED" || input.status === "CLOSED";
  let heldPayout: { id: string; amountKopecks: number } | null = null;

  if (movingToTerminal) {
    heldPayout = await db.payout.findFirst({
      where: { bookingId: complaint.bookingId, status: PAYOUT_STATUS_HELD },
      select: { id: true, amountKopecks: true },
      orderBy: { createdAt: "desc" },
    });

    if (heldPayout && !input.payoutDecision) {
      return {
        status: "decision_required",
        heldKopecks: heldPayout.amountKopecks,
        heldPayoutId: heldPayout.id,
      };
    }
  }

  const refundKopecks = complaint.booking.priceRub * 100;
  const wantWithhold = movingToTerminal && heldPayout && input.payoutDecision === "withhold";
  const wantRelease = movingToTerminal && heldPayout && input.payoutDecision === "release";

  const result = await db.$transaction(async (tx) => {
    await tx.complaint.update({
      where: { id: complaint.id },
      data: {
        status: input.status,
        resolution: input.resolution?.trim() || null,
        resolvedBy: movingToTerminal ? actor.userId : null,
        resolvedAt: movingToTerminal ? new Date() : null,
      },
    });

    if (!heldPayout) return { payoutAction: "none" as const };

    if (wantWithhold) {
      const flip = await tx.payout.updateMany({
        where: { id: heldPayout.id, status: PAYOUT_STATUS_HELD },
        data: {
          status: PAYOUT_STATUS_FAILED,
          processedAt: new Date(),
        },
      });
      if (flip.count === 0) return { payoutAction: "none" as const };

      // Z1a: возврат клиенту идёт НА КАРТУ через YooKassa уже после коммита
      // транзакции (refundSessionForBooking) — внешний API-вызов нельзя делать
      // внутри db.$transaction. Здесь только переводим бронь в REFUNDED.
      await tx.booking.update({
        where: { id: complaint.booking.id },
        data: { status: "REFUNDED" },
      });
      return { payoutAction: "withheld" as const };
    }

    if (wantRelease) {
      const flip = await tx.payout.updateMany({
        where: { id: heldPayout.id, status: PAYOUT_STATUS_HELD },
        data: { status: PAYOUT_STATUS_PENDING, holdReason: "payout_delay" },
      });
      if (flip.count === 0) return { payoutAction: "none" as const };
      await tx.booking.update({
        where: { id: complaint.booking.id },
        data: { status: "COMPLETED" },
      });
      return { payoutAction: "released" as const };
    }

    return { payoutAction: "none" as const };
  });

  // Audit + notifications happen after the transaction commits.
  await logAudit(
    actor.userId,
    "COMPLAINT_RESOLVED",
    complaint.id,
    `status=${input.status} payout=${result.payoutAction}`,
  );

  if (result.payoutAction === "withheld") {
    // Z1a: возврат на карту через YooKassa (после коммита транзакции).
    await refundSessionForBooking(complaint.booking.id, refundKopecks).catch((e) =>
      log.error("complaint_resolution.card_refund_failed", { complaintId: complaint.id, err: e }),
    );
    notify({
      userId: complaint.booking.clientId,
      event: "BALANCE_TOPUP",
      data: {
        amount: (refundKopecks / 100).toLocaleString("ru-RU"),
        reason: "Возврат по жалобе",
      },
    }).catch((e) => log.error("complaint_resolution.refund_notify_failed", { err: e }));
  }

  return {
    status: "ok",
    complaintStatus: input.status,
    payoutAction: result.payoutAction,
    ...(heldPayout ? { heldPayoutId: heldPayout.id } : {}),
  };
}
