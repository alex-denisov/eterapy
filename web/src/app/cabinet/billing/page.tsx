export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { appUrl } from "@/lib/subdomain";

// B464 IB3 / Механика 2: «Кошелёк» and «Подписка и оплата» were two money
// surfaces that partially duplicated each other. They are merged into the single
// «Кошелёк» page at /wallet (balance · top-up · subscription · cards · history).
// This route stays only as a backward-compatible redirect for old links.
export default async function CabinetBillingRedirect() {
  redirect(appUrl("/wallet"));
}
