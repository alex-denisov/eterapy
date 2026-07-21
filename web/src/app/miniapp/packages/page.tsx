import { miniAppOffers } from "@/lib/miniapp/journey-data";
import { PackagesScreen } from "@/components/miniapp/journey-screens";

// B554 п.10: CTA «докупить баллы» приводил на экран, открытый на вкладке
// «Подписка». Вкладка читается из `?tab=credits`, поэтому переход попадает
// сразу в баллы.
export default async function MiniAppPackagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <PackagesScreen offers={miniAppOffers()} initialKind={tab === "credits" ? "credits" : "subscription"} />;
}
