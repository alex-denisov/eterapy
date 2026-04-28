import type { Session } from "next-auth";
import db from "@/lib/db";

export type AccountAccessState = "active" | "blocked" | "deleted" | "missing";

export async function getAccountAccessState(userId: string | null | undefined): Promise<AccountAccessState> {
  if (!userId) return "missing";
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { blockedAt: true, deletedAt: true },
  });
  if (!user) return "missing";
  if (user.blockedAt) return "blocked";
  if (user.deletedAt) return "deleted";
  return "active";
}

export async function getSessionAccountAccessState(session: Session | null): Promise<AccountAccessState> {
  return getAccountAccessState(session?.user?.id);
}

export function inactiveAccountReason(state: AccountAccessState) {
  if (state === "blocked") return "blocked";
  if (state === "deleted" || state === "missing") return "deleted";
  return null;
}
