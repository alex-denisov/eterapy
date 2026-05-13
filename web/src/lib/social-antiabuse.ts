import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import type { requestFingerprint } from "@/lib/antifraud";

const MIN_CIRCLE_ANSWER_MS = 10_000;
const MIN_PAIR_PARTNER_MS = 30_000;
const HIGH_RISK_SCORE = 70;

const toxicPatterns = [
  /\b(убей|умри|сдохни|суицид|самоубий)/i,
  /\b(тварь|сука|мразь|ненавижу|уничтож)/i,
  /\b(die|kill yourself|hate you)\b/i,
];

const piiPatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\+?\d[\d\s().-]{7,}\d/,
  /(?:t\.me|telegram\.me|vk\.com|wa\.me)\//i,
  /@\w{4,32}/,
];

function normalizedText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerHash(value: string) {
  return createHash("sha256").update(normalizedText(value)).digest("hex");
}

function hasNearDuplicate(existingTexts: string[], nextText: string) {
  const next = normalizedText(nextText);
  if (!next) return false;
  return existingTexts.some((text) => {
    const existing = normalizedText(text);
    return existing === next || (existing.length > 40 && (existing.includes(next) || next.includes(existing)));
  });
}

export function detectSocialContentRisk(text: string) {
  const flags = new Set<string>();
  let score = 0;

  if (piiPatterns.some((pattern) => pattern.test(text))) {
    flags.add("pii_detected");
    score += 45;
  }
  if (toxicPatterns.some((pattern) => pattern.test(text))) {
    flags.add("toxicity_detected");
    score += 80;
  }

  return { score, flags: [...flags] };
}

export function assessCircleParticipantRisk(input: {
  circleCreatedAt: Date;
  creatorIpHash?: string | null;
  creatorDeviceHash?: string | null;
  existingAnswers: string[];
  existingDeviceHashes: (string | null)[];
  answerText: string;
  fingerprint: ReturnType<typeof requestFingerprint>;
}) {
  const flags = new Set<string>();
  let score = 0;
  const submittedAfterMs = Date.now() - input.circleCreatedAt.getTime();
  const content = detectSocialContentRisk(input.answerText);

  if (submittedAfterMs < MIN_CIRCLE_ANSWER_MS) {
    flags.add("fast_answer");
    score += 25;
  }
  if (input.creatorIpHash && input.creatorIpHash === input.fingerprint.ipHash) {
    flags.add("same_ip_as_creator");
    score += 25;
  }
  if (input.creatorDeviceHash && input.creatorDeviceHash === input.fingerprint.deviceHash) {
    flags.add("same_device_as_creator");
    score += 60;
  }
  if (input.fingerprint.deviceHash && input.existingDeviceHashes.includes(input.fingerprint.deviceHash)) {
    flags.add("duplicate_device_in_circle");
    score += 45;
  }
  if (hasNearDuplicate(input.existingAnswers, input.answerText)) {
    flags.add("duplicate_answer_text");
    score += 35;
  }

  for (const flag of content.flags) flags.add(flag);
  score += content.score;

  return {
    riskScore: Math.min(score, 100),
    riskFlags: [...flags],
    submittedAfterMs,
    answerHash: answerHash(input.answerText),
    shouldHide: flags.has("toxicity_detected") || score >= HIGH_RISK_SCORE,
    shouldReview: score >= HIGH_RISK_SCORE || flags.has("pii_detected") || flags.has("toxicity_detected"),
    rewardEligible: score < HIGH_RISK_SCORE && !flags.has("same_device_as_creator") && !flags.has("toxicity_detected"),
  };
}

export function assessPairPartnerRisk(input: {
  inviteCreatedAt: Date;
  creatorIpHash?: string | null;
  creatorDeviceHash?: string | null;
  partnerText: string;
  fingerprint: ReturnType<typeof requestFingerprint>;
}) {
  const flags = new Set<string>();
  let score = 0;
  const submittedAfterMs = Date.now() - input.inviteCreatedAt.getTime();
  const content = detectSocialContentRisk(input.partnerText);

  if (submittedAfterMs < MIN_PAIR_PARTNER_MS) {
    flags.add("fast_partner_completion");
    score += 20;
  }
  if (input.creatorIpHash && input.creatorIpHash === input.fingerprint.ipHash) {
    flags.add("same_ip_as_creator");
    score += 25;
  }
  if (input.creatorDeviceHash && input.creatorDeviceHash === input.fingerprint.deviceHash) {
    flags.add("same_device_as_creator");
    score += 60;
  }
  for (const flag of content.flags) flags.add(flag);
  score += content.score;

  return {
    riskScore: Math.min(score, 100),
    riskFlags: [...flags],
    submittedAfterMs,
    shouldReview: score >= HIGH_RISK_SCORE || flags.has("pii_detected") || flags.has("toxicity_detected"),
    rewardEligible: score < HIGH_RISK_SCORE && !flags.has("same_device_as_creator") && !flags.has("toxicity_detected"),
  };
}

export function socialRiskMetadata(input: {
  rewardEligible: boolean;
  submittedAfterMs?: number | null;
  moderation?: "accepted" | "hidden" | "review" | "declined" | "reported";
}): Prisma.InputJsonObject {
  return {
    rewardEligible: input.rewardEligible,
    submittedAfterMs: input.submittedAfterMs ?? null,
    moderation: input.moderation ?? "accepted",
  };
}
