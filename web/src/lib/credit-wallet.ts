import db from "@/lib/db";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { CREDIT_PACKS } from "@/lib/entitlements";

const ACTIVE_STATUSES = ["pending", "confirmed"];

export const WALLET_SOURCE_LABELS: Record<string, string> = {
  daily_practice: "Практика ясности",
  welcome: "Приветственные кредиты",
  streak: "Стрик практики",
  subscription: "Подписка",
  referral: "Реферальная программа",
  purchase: "Купленные кредиты",
  product: "Открытие продукта",
  mission: "Миссия",
  admin: "Начисление от команды",
};

export const WALLET_TYPE_LABELS: Record<string, string> = {
  grant: "Начисление",
  spend: "Списание",
  expire: "Сгорание",
  clawback: "Отмена",
  adjustment: "Коррекция",
};

export function creditsWord(n: number): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return "кредит";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "кредита";
  return "кредитов";
}

function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function expiryLabel(source: string, expiresAt: Date | null, now: Date): string {
  if (!expiresAt) return "без срока";
  const days = daysUntil(expiresAt, now);
  if (source === "welcome") return `сгорают через ${days} дн.`;
  if (source === "subscription") return `до ${formatDate(expiresAt)}`;
  return `ещё ${days} дн.`;
}

export type CreditWalletPack = {
  key: string;
  credits: number;
  amountKopecks: number;
  amountRub: string;
  pricePerCreditRub: string;
  label: string;
  badge?: string;
};

export type CreditWalletBreakdownItem = {
  key: string;
  source: string;
  label: string;
  amount: number;
  expiresAt: Date | null;
  expiryLabel: string;
};

export type CreditWalletHistoryItem = {
  id: string;
  amount: number;
  balanceAfter: number | null;
  type: string;
  typeLabel: string;
  source: string;
  sourceLabel: string;
  sourceEventId: string | null;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
};

function walletPacks(): CreditWalletPack[] {
  return Object.entries(CREDIT_PACKS).map(([key, pack]) => ({
    key,
    credits: pack.credits,
    amountKopecks: pack.amountKopecks,
    amountRub: (pack.amountKopecks / 100).toFixed(0),
    pricePerCreditRub: (pack.amountKopecks / 100 / pack.credits).toFixed(1),
    label: pack.label,
    badge: pack.badge,
  }));
}

function buildBreakdown(
  entries: Array<{ amount: number; source: string; expiresAt: Date | null }>,
  now: Date,
): CreditWalletBreakdownItem[] {
  const grouped = new Map<string, CreditWalletBreakdownItem>();

  for (const entry of entries) {
    if (entry.expiresAt && entry.expiresAt <= now) continue;
    const key = `${entry.source}:${entry.expiresAt?.toISOString() ?? "no-expiry"}`;
    const current = grouped.get(key);
    if (current) {
      current.amount += entry.amount;
      continue;
    }
    grouped.set(key, {
      key,
      source: entry.source,
      label: WALLET_SOURCE_LABELS[entry.source] ?? entry.source,
      amount: entry.amount,
      expiresAt: entry.expiresAt,
      expiryLabel: expiryLabel(entry.source, entry.expiresAt, now),
    });
  }

  return Array.from(grouped.values())
    .filter((item) => item.amount !== 0)
    .sort((a, b) => {
      if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime();
      if (a.expiresAt) return -1;
      if (b.expiresAt) return 1;
      return b.amount - a.amount;
    });
}

export async function getCreditWalletSnapshot(userId: string, now = new Date()) {
  const [balance, activeEntries, history] = await Promise.all([
    getClarityCreditBalance(userId),
    db.clarityCreditLedgerEntry.findMany({
      where: {
        userId,
        status: { in: ACTIVE_STATUSES },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { amount: true, source: true, expiresAt: true },
    }),
    db.clarityCreditLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        balanceAfter: true,
        type: true,
        source: true,
        sourceEventId: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);

  const breakdown = buildBreakdown(activeEntries, now);

  return {
    balance,
    breakdown,
    packs: walletPacks(),
    history: history.map((entry) => ({
      ...entry,
      typeLabel: WALLET_TYPE_LABELS[entry.type] ?? entry.type,
      sourceLabel: WALLET_SOURCE_LABELS[entry.source] ?? entry.source,
    })),
  };
}
