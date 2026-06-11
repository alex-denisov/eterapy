// B366 (M26): server-only DB getter for the practitioner session floor. Lives in
// its own module so the pure constants in `session-pricing.ts` stay client-safe.

import { PractitionerStatus } from "@prisma/client";
import db from "@/lib/db";
import { MIN_SESSION_PRICE_RUB, SESSION_BASE_DURATION_MIN } from "@/lib/session-pricing";

// DB-driven floor: cheapest enabled 60-min tariff of an ACTIVE practitioner, with
// a graceful fallback to the advertised constant when no 60-min tariff exists yet.
export async function getMinSessionPriceRub(): Promise<number> {
  const base = { enabled: true, practitioner: { status: PractitionerStatus.ACTIVE } } as const;
  const sixty = await db.priceRate
    .findFirst({
      where: { ...base, durationMin: SESSION_BASE_DURATION_MIN },
      orderBy: { priceRub: "asc" },
      select: { priceRub: true },
    })
    .catch(() => null);
  if (sixty?.priceRub) return sixty.priceRub;

  const anyRate = await db.priceRate
    .findFirst({
      where: base,
      orderBy: { priceRub: "asc" },
      select: { priceRub: true },
    })
    .catch(() => null);
  return anyRate?.priceRub ?? MIN_SESSION_PRICE_RUB;
}
