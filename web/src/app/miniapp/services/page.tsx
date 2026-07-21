import { loadMiniAppPractitioners } from "@/lib/miniapp/journey-data";
import { ServicesScreen } from "@/components/miniapp/screens/services-screen";

// B558: витрина услуг и живые специалисты живут на одной странице и
// фильтруются одними переключателями — поэтому список специалистов грузится
// здесь, а не прячется за кнопкой «Специалисты» над каталогом.
export default async function MiniAppServicesPage() {
  return <ServicesScreen practitioners={await loadMiniAppPractitioners()} />;
}
