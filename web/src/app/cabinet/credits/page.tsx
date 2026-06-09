export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { appUrl } from "@/lib/subdomain";

// B349 / Механика 2: /credits and /wallet were two near-identical pages. They
// are now merged into the single «Кошелёк» page at /wallet (balance, top-up,
// spend catalog, history). This route stays only as a backward-compatible
// permanent redirect for old links/bookmarks — there is no second page anymore.
export default async function CabinetCreditsRedirect() {
  redirect(appUrl("/wallet"));
}
