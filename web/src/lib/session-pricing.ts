// B366 (M26): single source of truth for the "от … ₽" practitioner session floor.
// Client-safe (no `db`) so client surfaces (checkin, faq) derive from the same
// constant. The DB-driven getter lives in `session-pricing-server.ts`.
//
// The home/checkin surface used to advertise «от 4 500 ₽», the wallet «от 1 500 ₽»
// and the catalog «от 2 000 ₽» — three different fictions. The advertised floor is
// now ONE number, anchored to a 60-minute base session, used by every surface.

// 60-minute base floor (₽). Matches the catalog «от 2 000 ₽» the plan settled on.
export const MIN_SESSION_PRICE_RUB = 2000;

// Base session length the floor is quoted for. The «от 4 500 ₽» discrepancy came
// from quoting a non-60-min slot — the floor is always quoted per 60 minutes.
export const SESSION_BASE_DURATION_MIN = 60;

// "от 2 000 ₽" — the single advertised floor label for static marketing surfaces.
export function formatSessionFloor(priceRub: number = MIN_SESSION_PRICE_RUB): string {
  return `от ${priceRub.toLocaleString("ru-RU")} ₽`;
}
