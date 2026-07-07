import { redirect } from "next/navigation";
import { appUrl } from "@/lib/subdomain";

// B466: «Баланс и доходы» переехал в «Финансы» (таб «Баланс»). Старые ссылки
// и deep-links уведомлений продолжают работать через этот redirect.
export const dynamic = "force-dynamic";

export default function LegacyEarningsRedirect() {
  redirect(appUrl("/practitioner/finance"));
}
