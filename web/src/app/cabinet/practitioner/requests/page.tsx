import { redirect } from "next/navigation";
import { appUrl } from "@/lib/subdomain";

// B466: «Новые заявки» переехали в «Календарь → Заявки». Старые ссылки и
// deep-links уведомлений продолжают работать через этот redirect.
export const dynamic = "force-dynamic";

export default function LegacyRequestsRedirect() {
  redirect(appUrl("/practitioner/calendar?tab=requests"));
}
