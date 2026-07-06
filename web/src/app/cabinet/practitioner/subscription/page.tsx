import { redirect } from "next/navigation";
import { appUrl } from "@/lib/subdomain";

// B466: «Подписка практика» переехала в «Финансы» (таб «Тариф»). Старые ссылки
// и deep-links уведомлений продолжают работать через этот redirect.
export const dynamic = "force-dynamic";

export default function LegacySubscriptionRedirect() {
  redirect(appUrl("/practitioner/finance?tab=tariff"));
}
