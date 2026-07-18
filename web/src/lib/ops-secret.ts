import { timingSafeEqual } from "node:crypto";

/**
 * Сравнение секретов за постоянное время — чтобы по времени ответа нельзя
 * было подобрать `FLEET_OPS_SECRET` побайтово.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
