import { redirect } from "next/navigation";
import { appUrl } from "@/lib/subdomain";

// B466: «Расписание и тарифы» переехали в «Календарь» (Доступность = рабочие
// часы + цены). Старые ссылки продолжают работать через этот redirect.
export const dynamic = "force-dynamic";

export default function LegacySchedulePageRedirect() {
  redirect(appUrl("/practitioner/calendar?tab=availability"));
}
