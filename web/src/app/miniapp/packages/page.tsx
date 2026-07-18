import { miniAppOffers } from "@/lib/miniapp/journey-data";
import { PackagesScreen } from "@/components/miniapp/journey-screens";

export default function MiniAppPackagesPage() {
  return <PackagesScreen offers={miniAppOffers()} />;
}
