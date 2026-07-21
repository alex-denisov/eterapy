import { loadMiniAppPractitioners } from "@/lib/miniapp/journey-data";
import { PractitionersScreen } from "@/components/miniapp/journey-screens";

export default async function MiniAppPractitionersPage() {
  return <PractitionersScreen practitioners={await loadMiniAppPractitioners()} />;
}
