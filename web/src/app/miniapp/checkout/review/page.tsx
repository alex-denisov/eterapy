import { miniAppService } from "@/lib/miniapp/catalog";
import { loadMiniAppPractitioner, miniAppOffers } from "@/lib/miniapp/journey-data";
import { CheckoutReviewScreen, type ReviewOffer } from "@/components/miniapp/journey-screens";

export default async function MiniAppCheckoutReviewPage({ searchParams }: { searchParams: Promise<{ offer?: string; slot?: string }> }) {
  const query = await searchParams;
  const key = query.offer ?? "";
  let offer: ReviewOffer | null = null;
  if (key.startsWith("service:")) {
    const service = miniAppService(key.slice("service:".length));
    if (service) offer = { key, title: service.title, price: service.price, note: service.priceMeta, kind: "service" };
  } else if (key.startsWith("practitioner:")) {
    const practitioner = await loadMiniAppPractitioner(key.slice("practitioner:".length));
    if (practitioner) offer = { key, title: `Встреча с ${practitioner.name}`, price: `${practitioner.priceRub.toLocaleString("ru-RU")} ₽`, note: `${practitioner.durationMin} минут`, kind: "practitioner" };
  } else {
    const found = miniAppOffers().find((item) => item.key === key);
    if (found) offer = { key, title: found.title, price: found.price, note: found.note, kind: found.kind };
  }
  return <CheckoutReviewScreen offer={offer} slot={query.slot ?? null} />;
}
