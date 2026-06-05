import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { recordClarityCreditEntry } from "@/lib/clarity-credits";
import { creditExpiryFor } from "@/lib/credit-expiry";
import { logFraudEvent, requestFingerprint } from "@/lib/antifraud";
import { trackServerEvent } from "@/lib/analytics";
import db from "@/lib/db";

export const WELCOME_CREDIT_AMOUNT = 3;
const WELCOME_SOURCE_EVENT_PREFIX = "welcome:";
const WELCOME_DEVICE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PG_ADVISORY_LOCK_MAX = (BigInt(1) << BigInt(63)) - BigInt(1);

export type WelcomeCreditGrantResult =
  | { status: "granted"; amount: typeof WELCOME_CREDIT_AMOUNT }
  | { status: "already_granted"; amount: 0 }
  | { status: "blocked"; amount: 0; reason: "duplicate_device_30d" };

export function welcomeCreditSourceEventId(userId: string) {
  return `${WELCOME_SOURCE_EVENT_PREFIX}${userId}`;
}

function advisoryLockKey(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return BigInt(`0x${hex}`) & PG_ADVISORY_LOCK_MAX;
}

export async function grantWelcomeCredits(input: {
  request: NextRequest;
  userId: string;
  now?: Date;
}): Promise<WelcomeCreditGrantResult> {
  const now = input.now ?? new Date();
  const fingerprint = requestFingerprint(input.request);
  const sourceEventId = welcomeCreditSourceEventId(input.userId);
  const sinceDeviceWindow = new Date(now.getTime() - WELCOME_DEVICE_WINDOW_DAYS * DAY_MS);

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryLockKey(sourceEventId)})`;

    const existingGrant = await tx.clarityCreditLedgerEntry.count({
      where: {
        userId: input.userId,
        source: "welcome",
        sourceEventId,
        type: "grant",
        status: { in: ["pending", "confirmed"] },
      },
    });
    if (existingGrant > 0) {
      return { status: "already_granted", amount: 0 } satisfies WelcomeCreditGrantResult;
    }

    const sameDeviceWelcomeCount = fingerprint.deviceHash
      ? await tx.clarityCreditLedgerEntry.count({
          where: {
            source: "welcome",
            type: "grant",
            status: "confirmed",
            createdAt: { gte: sinceDeviceWindow },
            metadata: {
              path: ["deviceHash"],
              equals: fingerprint.deviceHash,
            },
          },
        })
      : 0;

    if (sameDeviceWelcomeCount > 0) {
      await logFraudEvent(tx, {
        subjectType: "welcome_credit",
        subjectId: sourceEventId,
        actorUserId: input.userId,
        riskScore: 80,
        riskFlags: ["duplicate_welcome_device_30d"],
        action: "welcome_credit_blocked",
        status: "blocked",
        ipHash: fingerprint.ipHash,
        userAgentHash: fingerprint.userAgentHash,
        deviceHash: fingerprint.deviceHash,
        metadata: {
          sourceEventId,
          duplicateWindowDays: WELCOME_DEVICE_WINDOW_DAYS,
        } as Prisma.InputJsonObject,
      });
      return { status: "blocked", amount: 0, reason: "duplicate_device_30d" } satisfies WelcomeCreditGrantResult;
    }

    const expiresAt = creditExpiryFor("welcome", now);
    await recordClarityCreditEntry(tx, {
      userId: input.userId,
      amount: WELCOME_CREDIT_AMOUNT,
      type: "grant",
      source: "welcome",
      sourceEventId,
      status: "confirmed",
      expiresAt,
      metadata: {
        sourceEventId,
        trigger: "email_verified",
        deviceHash: fingerprint.deviceHash,
      } as Prisma.InputJsonObject,
    });
    await logFraudEvent(tx, {
      subjectType: "welcome_credit",
      subjectId: sourceEventId,
      actorUserId: input.userId,
      riskScore: 0,
      riskFlags: [],
      action: "welcome_credit_granted",
      status: "logged",
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      deviceHash: fingerprint.deviceHash,
      metadata: {
        sourceEventId,
        amount: WELCOME_CREDIT_AMOUNT,
        expiresAt: expiresAt?.toISOString() ?? null,
      } as Prisma.InputJsonObject,
    });

    return { status: "granted", amount: WELCOME_CREDIT_AMOUNT } satisfies WelcomeCreditGrantResult;
  });

  if (result.status === "granted") {
    trackServerEvent(db, {
      event: "welcome_credits_granted",
      userId: input.userId,
      surface: "auth_verify_email",
      ipHash: fingerprint.ipHash,
      userAgent: fingerprint.userAgentHash,
      properties: {
        amount: WELCOME_CREDIT_AMOUNT,
        expiresInDays: 14,
      } as Prisma.InputJsonObject,
    });
  }

  return result;
}
