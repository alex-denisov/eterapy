// B417 (M27) — чат-компаньон переехал из кабинета в каталог услуг:
// /cabinet/chat → /products/chat. Перенаправляем (сохраняя ?dialogueId=),
// чтобы старые ссылки и закладки не отдавали 404.

import { redirect } from "next/navigation";
import { mainUrl } from "@/lib/subdomain";

export const dynamic = "force-dynamic";

export default async function CabinetChatRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ dialogueId?: string }>;
}) {
  const sp = await searchParams;
  const path = sp?.dialogueId
    ? `/products/chat?dialogueId=${encodeURIComponent(sp.dialogueId)}`
    : "/products/chat";
  redirect(mainUrl(path));
}
